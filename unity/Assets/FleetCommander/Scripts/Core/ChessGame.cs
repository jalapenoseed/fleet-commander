using System;
using System.Collections.Generic;
using System.Text;

namespace FleetCommander.Core
{
    public enum ChessResult { Playing, Checkmate, Stalemate, Repetition, FiftyMoves, InsufficientMaterial }
    public struct ChessMove
    {
        public int from,to,promotion;
        public ChessMove(int from,int to,int promotion=0){this.from=from;this.to=to;this.promotion=promotion;}
        public override string ToString()=>ChessGame.Square(from)+"–"+ChessGame.Square(to)+(promotion==0?"":"="+ChessGame.Letter(promotion));
    }
    // Positive = white, negative = black. 1 pawn, 2 knight, 3 bishop, 4 rook, 5 queen, 6 king.
    public sealed class ChessGame
    {
        public int[] Board {get;private set;}=new int[64];
        public int Turn {get;private set;}=1;
        public int Castling {get;private set;}=15; // WK WQ BK BQ
        public int EnPassant {get;private set;}=-1;
        public int HalfMoves {get;private set;}
        public int MoveNumber {get;private set;}=1;
        public ChessResult Result {get;private set;}
        public readonly List<string> History=new List<string>();
        readonly Dictionary<string,int> positions=new Dictionary<string,int>();
        public ChessGame(){Reset();}
        public void Reset()=>LoadFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
        public static string Square(int square)=>((char)('a'+square%8)).ToString()+(square/8+1);
        public static string Letter(int piece)=>new[]{"","P","N","B","R","Q","K"}[Math.Abs(piece)];
        public string Status=>Result==ChessResult.Playing?(Turn==1?"White":"Black")+" to move"+(InCheck(Turn)?" · CHECK":""):
            Result==ChessResult.Checkmate?(Turn==1?"BLACK":"WHITE")+" WINS · CHECKMATE":"DRAW · "+(Result==ChessResult.FiftyMoves?"50-MOVE RULE":Result==ChessResult.InsufficientMaterial?"INSUFFICIENT MATERIAL":Result.ToString().ToUpperInvariant());
        public void LoadFen(string fen)
        {
            var fields=fen.Split(' ');if(fields.Length<4)throw new ArgumentException("Invalid position.");var board=new int[64];int rank=7,file=0;
            foreach(char c in fields[0])
            {
                if(c=='/'){if(file!=8)throw new ArgumentException("Invalid rank.");rank--;file=0;continue;}
                if(c>='1'&&c<='8'){file+=c-'0';continue;}
                int p=" pnbrqk".IndexOf(char.ToLowerInvariant(c));if(p<1||rank<0||file>7)throw new ArgumentException("Invalid piece.");board[rank*8+file++]=char.IsUpper(c)?p:-p;
            }
            if(rank!=0||file!=8||Array.FindAll(board,p=>p==6).Length!=1||Array.FindAll(board,p=>p==-6).Length!=1)throw new ArgumentException("Position requires two kings.");
            if(fields[1]!="w"&&fields[1]!="b")throw new ArgumentException("Invalid side.");
            int ep=-1;if(fields[3]!="-"){if(fields[3].Length!=2||fields[3][0]<'a'||fields[3][0]>'h'||(fields[3][1]!='3'&&fields[3][1]!='6'))throw new ArgumentException("Invalid en passant square.");ep=(fields[3][1]-'1')*8+fields[3][0]-'a';}
            Board=board;Turn=fields[1]=="w"?1:-1;Castling=0;
            for(int i=0;i<4;i++)if(fields[2].IndexOf("KQkq"[i])>=0)Castling|=1<<i;
            EnPassant=ep;HalfMoves=fields.Length>4?int.Parse(fields[4]):0;MoveNumber=fields.Length>5?int.Parse(fields[5]):1;
            History.Clear();positions.Clear();Result=ChessResult.Playing;positions[Key()]=1;EvaluateResult();
        }
        ChessGame(bool empty){}
        ChessGame Copy()=>new ChessGame(true){Board=(int[])Board.Clone(),Turn=Turn,Castling=Castling,EnPassant=EnPassant,HalfMoves=HalfMoves,MoveNumber=MoveNumber};
        public bool InCheck(int side){int king=Array.IndexOf(Board,6*side);return king<0||Attacked(king,-side);}
        public bool Attacked(int square,int by)
        {
            int x=square%8,y=square/8;
            for(int i=0;i<64;i++)
            {
                int p=Board[i];if(Math.Sign(p)!=by)continue;int dx=x-i%8,dy=y-i/8;int kind=Math.Abs(p);
                if(kind==1&&dy==by&&Math.Abs(dx)==1)return true;
                if(kind==2&&Math.Abs(dx)*Math.Abs(dy)==2)return true;
                if(kind==6&&Math.Max(Math.Abs(dx),Math.Abs(dy))==1)return true;
                if((kind==3||kind==5)&&Math.Abs(dx)==Math.Abs(dy)&&dx!=0&&Clear(i,square))return true;
                if((kind==4||kind==5)&&((dx==0)!=(dy==0))&&Clear(i,square))return true;
            }
            return false;
        }
        bool Clear(int from,int to)
        {
            int x=from%8,y=from/8,dx=Math.Sign(to%8-x),dy=Math.Sign(to/8-y);x+=dx;y+=dy;
            while(x!=to%8||y!=to/8){if(Board[y*8+x]!=0)return false;x+=dx;y+=dy;}return true;
        }
        public List<ChessMove> LegalMoves(int from=-1)
        {
            var moves=new List<ChessMove>();
            for(int i=0;i<64;i++)if((from<0||i==from)&&Math.Sign(Board[i])==Turn)
            {
                int kind=Math.Abs(Board[i]),x=i%8,y=i/8;
                for(int j=0;j<64;j++)
                {
                    if(i==j||Math.Sign(Board[j])==Turn||Math.Abs(Board[j])==6)continue;
                    int dx=j%8-x,dy=j/8-y;bool allowed=false;
                    switch(kind)
                    {
                        case 1:
                            allowed=dx==0&&dy==Turn&&Board[j]==0||dx==0&&dy==2*Turn&&y==(Turn==1?1:6)&&Board[j]==0&&Board[i+8*Turn]==0||Math.Abs(dx)==1&&dy==Turn&&(Board[j]!=0||j==EnPassant&&Board[j-8*Turn]==-Turn);
                            break;
                        case 2:allowed=Math.Abs(dx)*Math.Abs(dy)==2;break;
                        case 3:allowed=Math.Abs(dx)==Math.Abs(dy)&&Clear(i,j);break;
                        case 4:allowed=((dx==0)!=(dy==0))&&Clear(i,j);break;
                        case 5:allowed=(Math.Abs(dx)==Math.Abs(dy)||((dx==0)!=(dy==0)))&&Clear(i,j);break;
                        case 6:allowed=Math.Max(Math.Abs(dx),Math.Abs(dy))==1;break;
                    }
                    if(!allowed)continue;
                    if(kind==1&&(j/8==0||j/8==7)){foreach(int promote in new[]{5,4,3,2})AddLegal(moves,new ChessMove(i,j,promote));}
                    else AddLegal(moves,new ChessMove(i,j));
                }
                if(kind==6&&i==(Turn==1?4:60)&&!InCheck(Turn))
                {
                    int shift=Turn==1?0:2;
                    if((Castling&(1<<shift))!=0&&Board[i+3]==4*Turn&&Board[i+1]==0&&Board[i+2]==0&&!Attacked(i+1,-Turn)&&!Attacked(i+2,-Turn))AddLegal(moves,new ChessMove(i,i+2));
                    if((Castling&(2<<shift))!=0&&Board[i-4]==4*Turn&&Board[i-1]==0&&Board[i-2]==0&&Board[i-3]==0&&!Attacked(i-1,-Turn)&&!Attacked(i-2,-Turn))AddLegal(moves,new ChessMove(i,i-2));
                }
            }
            return moves;
        }
        void AddLegal(List<ChessMove> list,ChessMove move){var next=Copy();next.Raw(move);if(!next.InCheck(Turn))list.Add(move);}
        void Raw(ChessMove move)
        {
            int piece=Board[move.from],taken=Board[move.to],kind=Math.Abs(piece);
            if(kind==1&&move.to==EnPassant&&taken==0&&move.from%8!=move.to%8)Board[move.to-8*Turn]=0;
            Board[move.to]=move.promotion==0?piece:Turn*move.promotion;Board[move.from]=0;
            if(kind==6)
            {
                Castling&=Turn==1?12:3;
                if(move.to-move.from==2){Board[move.from+1]=Board[move.from+3];Board[move.from+3]=0;}
                if(move.to-move.from==-2){Board[move.from-1]=Board[move.from-4];Board[move.from-4]=0;}
            }
            if(move.from==0||move.to==0)Castling&=~2;if(move.from==7||move.to==7)Castling&=~1;
            if(move.from==56||move.to==56)Castling&=~8;if(move.from==63||move.to==63)Castling&=~4;
            EnPassant=kind==1&&Math.Abs(move.to-move.from)==16?(move.from+move.to)/2:-1;
            HalfMoves=kind==1||taken!=0?0:HalfMoves+1;if(Turn<0)MoveNumber++;Turn=-Turn;
        }
        public bool Move(int from,int to,int promotion=5)
        {
            if(Result!=ChessResult.Playing)return false;
            foreach(var move in LegalMoves(from))if(move.to==to&&(move.promotion==0||move.promotion==promotion))
            {
                string text=(Turn==1?MoveNumber+". White ":MoveNumber+". Black ")+Letter(Board[from])+" "+move;
                Raw(move);History.Add(text);string key=Key();positions[key]=positions.TryGetValue(key,out int n)?n+1:1;EvaluateResult();return true;
            }
            return false;
        }
        string Key()
        {
            var key=new StringBuilder();foreach(int p in Board)key.Append((char)('G'+p));
            // An uncapturable en passant target does not distinguish repeated positions.
            int ep=-1;
            if(EnPassant>=0)for(int i=0;i<64;i++)if(Board[i]==Turn&&Math.Abs(i%8-EnPassant%8)==1&&EnPassant/8-i/8==Turn&&Board[EnPassant-8*Turn]==-Turn)
            {var copy=Copy();copy.Raw(new ChessMove(i,EnPassant));if(!copy.InCheck(Turn))ep=EnPassant;}
            return key.Append('/').Append(Turn).Append('/').Append(Castling).Append('/').Append(ep).ToString();
        }
        void EvaluateResult()
        {
            Result=ChessResult.Playing;
            if(LegalMoves().Count==0){Result=InCheck(Turn)?ChessResult.Checkmate:ChessResult.Stalemate;return;}
            int minors=0,bishops=0,parity=-1;bool sameColor=true;
            for(int i=0;i<64;i++)
            {
                int p=Math.Abs(Board[i]);if(p==0||p==6)continue;
                if(p==1||p==4||p==5){minors=100;break;}
                minors++;if(p==3){bishops++;int color=(i%8+i/8)%2;if(parity>=0&&parity!=color)sameColor=false;parity=color;}
            }
            if(minors<=1||minors==bishops&&sameColor){Result=ChessResult.InsufficientMaterial;return;}
            if(HalfMoves>=100){Result=ChessResult.FiftyMoves;return;}
            if(positions.TryGetValue(Key(),out int count)&&count>=3)Result=ChessResult.Repetition;
        }
        public ChessMove? Suggest(int depth=2)
        {
            if(Result!=ChessResult.Playing)return null;var moves=LegalMoves();ChessMove? best=null;int score=int.MinValue;
            foreach(var move in moves)
            {
                var next=Copy();next.Raw(move);int value=-next.Search(Math.Max(0,Math.Min(3,depth)-1),-100000,100000);
                if(value>score){score=value;best=move;}
            }
            return best;
        }
        int Search(int depth,int alpha,int beta)
        {
            var moves=LegalMoves();if(moves.Count==0)return InCheck(Turn)?-90000-depth:0;
            if(depth==0){int total=0;int[] values={0,100,320,330,500,900,0};for(int i=0;i<64;i++){int p=Board[i];int bonus=Math.Abs(p)==1?(p>0?i/8:7-i/8)*4:Math.Abs(p)==2?(int)(14-4*(Math.Abs(i%8-3.5)+Math.Abs(i/8-3.5))):0;total+=Math.Sign(p)*(values[Math.Abs(p)]+bonus);}return total*Turn;}
            moves.Sort((a,b)=>Math.Abs(Board[b.to]).CompareTo(Math.Abs(Board[a.to])));
            foreach(var move in moves){var next=Copy();next.Raw(move);int score=-next.Search(depth-1,-beta,-alpha);if(score>=beta)return beta;alpha=Math.Max(alpha,score);}return alpha;
        }
    }
}
