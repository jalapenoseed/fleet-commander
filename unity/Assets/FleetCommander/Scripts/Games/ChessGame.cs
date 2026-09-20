using System;
using System.Collections.Generic;
using System.Text;
namespace FleetCommander.Games
{
    // Board indices are a1=0 ... h8=63. Positive pieces are White; negative are Black.
    public struct ChessMove : IEquatable<ChessMove>
    {
        public int From,To,Promotion;
        public ChessMove(int from,int to,int promotion=0){From=from;To=to;Promotion=promotion;}
        public bool Equals(ChessMove m)=>From==m.From&&To==m.To&&Promotion==m.Promotion;
        public override string ToString()=>ChessGame.Square(From)+ChessGame.Square(To)+(Promotion==0?"":" PNBRQK"[Promotion].ToString());
    }
    public sealed class ChessGame
    {
        public const int Pawn=1,Knight=2,Bishop=3,Rook=4,Queen=5,King=6;
        public int[] Board {get;private set;}=new int[64];
        public int Side {get;private set;}=1;
        public int Castling {get;private set;}=15;
        public int EnPassant {get;private set;}=-1;
        public int HalfMoves {get;private set;}
        public int FullMove {get;private set;}=1;
        public bool Finished {get;private set;}
        public int Winner {get;private set;} // 1 White, -1 Black, 0 drawn
        public string Result {get;private set;}="";
        public int Revision {get;private set;}
        public ChessMove? LastMove {get;private set;}
        public readonly List<string> History=new List<string>();
        readonly Dictionary<string,int> repetitions=new Dictionary<string,int>();
        public bool InCheck=>IsCheck(Side);
        public string TurnText=>Finished?Result:(Side==1?"White":"Black")+" to move"+(InCheck?" · CHECK":"");
        public bool CanClaimDraw=>!Finished&&(HalfMoves>=100||Repetitions>=3);
        int Repetitions {get{repetitions.TryGetValue(PositionKey(),out int n);return n;}}
        public ChessGame(){Setup("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");}
        public static string Square(int i)=>((char)('a'+i%8)).ToString()+(i/8+1);
        public static int ParseSquare(string s)=>s[0]-'a'+(s[1]-'1')*8;
        public static string PieceName(int p)=>new[]{"","Pawn","Knight","Bishop","Rook","Queen","King"}[Math.Abs(p)];
        public void Setup(string fen)
        {
            var parts=fen.Split(' ');Board=new int[64];int x=0,y=7;
            foreach(char c in parts[0]){if(c=='/'){x=0;y--;continue;}if(char.IsDigit(c)){x+=c-'0';continue;}int p=" pnbrqk".IndexOf(char.ToLowerInvariant(c));if(p<1||x>7||y<0)throw new ArgumentException("Invalid FEN");Board[y*8+x++]=char.IsUpper(c)?p:-p;}
            Side=parts[1]=="w"?1:-1;Castling=0;
            if(parts[2].Contains("K"))Castling|=1;if(parts[2].Contains("Q"))Castling|=2;if(parts[2].Contains("k"))Castling|=4;if(parts[2].Contains("q"))Castling|=8;
            EnPassant=parts[3]=="-"?-1:ParseSquare(parts[3]);HalfMoves=parts.Length>4?int.Parse(parts[4]):0;FullMove=parts.Length>5?int.Parse(parts[5]):1;
            Finished=false;Winner=0;Result="";LastMove=null;History.Clear();repetitions.Clear();repetitions[PositionKey()]=1;Revision++;Evaluate();
        }
        ChessGame(bool empty){}
        public ChessGame Copy()
        {
            var g=new ChessGame(true){Board=(int[])Board.Clone(),Side=Side,Castling=Castling,EnPassant=EnPassant,HalfMoves=HalfMoves,FullMove=FullMove,Finished=Finished,Winner=Winner,Result=Result,Revision=Revision,LastMove=LastMove};
            foreach(var p in repetitions)g.repetitions.Add(p.Key,p.Value);g.History.AddRange(History);return g;
        }
        public List<ChessMove> LegalMoves()
        {
            var legal=new List<ChessMove>();if(Finished)return legal;
            foreach(var m in PseudoMoves()) {var g=PositionCopy();g.Apply(m);if(!g.IsCheck(Side))legal.Add(m);}return legal;
        }
        ChessGame PositionCopy()=>new ChessGame(true){Board=(int[])Board.Clone(),Side=Side,Castling=Castling,EnPassant=EnPassant,HalfMoves=HalfMoves,FullMove=FullMove};
        public bool Move(ChessMove m)
        {
            if(Finished||!LegalMoves().Contains(m))return false;
            int p=Board[m.From];bool capture=Board[m.To]!=0||(Math.Abs(p)==Pawn&&m.To==EnPassant);
            string notation=Math.Abs(p)==King&&Math.Abs(m.To-m.From)==2?(m.To>m.From?"O-O":"O-O-O"):(Math.Abs(p)==Pawn?"":" PNBRQK"[Math.Abs(p)].ToString())+Square(m.From)+(capture?"x":"–")+Square(m.To)+(m.Promotion==0?"":"="+" PNBRQK"[m.Promotion]);
            Apply(m);LastMove=m;Revision++;string key=PositionKey();repetitions.TryGetValue(key,out int count);repetitions[key]=count+1;Evaluate();
            History.Add(notation+(Finished&&Winner!=0?"#":InCheck?"+":""));return true;
        }
        void Apply(ChessMove m)
        {
            int p=Board[m.From],captured=Board[m.To],side=Side;
            if(Math.Abs(p)==Pawn&&m.To==EnPassant&&captured==0)Board[m.To-side*8]=0;
            Board[m.To]=m.Promotion==0?p:side*m.Promotion;Board[m.From]=0;
            if(Math.Abs(p)==King){Castling&=side==1?12:3;if(Math.Abs(m.To-m.From)==2){int rf=m.To>m.From?m.From+3:m.From-4,rt=m.To>m.From?m.From+1:m.From-1;Board[rt]=Board[rf];Board[rf]=0;}}
            if(m.From==0||m.To==0)Castling&=~2;if(m.From==7||m.To==7)Castling&=~1;if(m.From==56||m.To==56)Castling&=~8;if(m.From==63||m.To==63)Castling&=~4;
            EnPassant=Math.Abs(p)==Pawn&&Math.Abs(m.To-m.From)==16?(m.To+m.From)/2:-1;
            HalfMoves=Math.Abs(p)==Pawn||captured!=0?0:HalfMoves+1;if(side==-1)FullMove++;Side=-side;
        }
        IEnumerable<ChessMove> PseudoMoves()
        {
            for(int i=0;i<64;i++)
            {
                int piece=Board[i];if(piece*Side<=0)continue;int p=Math.Abs(piece),x=i%8,y=i/8;
                if(p==Pawn)
                {
                    int ny=y+Side;if(ny<0||ny>7)continue;
                    int f=i+Side*8;if(Board[f]==0){foreach(var m in PawnMove(i,f))yield return m;int f2=i+Side*16;if(y==(Side==1?1:6)&&Board[f2]==0)yield return new ChessMove(i,f2);}
                    for(int dx=-1;dx<=1;dx+=2)if(x+dx>=0&&x+dx<8){int t=ny*8+x+dx;if((Board[t]*Side<0&&Math.Abs(Board[t])!=King)||(t==EnPassant&&Board[t-Side*8]==-Side*Pawn))foreach(var m in PawnMove(i,t))yield return m;}
                    continue;
                }
                if(p==Knight)
                {
                    int[] dx={1,2,2,1,-1,-2,-2,-1},dy={2,1,-1,-2,-2,-1,1,2};
                    for(int k=0;k<8;k++){int nx=x+dx[k],ny=y+dy[k];if(nx>=0&&nx<8&&ny>=0&&ny<8){int t=ny*8+nx;if(Board[t]*Side<=0&&Math.Abs(Board[t])!=King)yield return new ChessMove(i,t);}}continue;
                }
                for(int dx=-1;dx<=1;dx++)for(int dy=-1;dy<=1;dy++)
                {
                    if(dx==0&&dy==0||p==Bishop&&(dx==0||dy==0)||p==Rook&&dx!=0&&dy!=0)continue;
                    for(int d=1;d<8;d++){int nx=x+dx*d,ny=y+dy*d;if(nx<0||nx>7||ny<0||ny>7)break;int t=ny*8+nx;if(Board[t]*Side>0||Math.Abs(Board[t])==King)break;yield return new ChessMove(i,t);if(Board[t]!=0||p==King)break;}
                }
                if(p==King&&i==(Side==1?4:60)&&!IsCheck(Side))
                {
                    int k=Side==1?1:4,q=Side==1?2:8;
                    if((Castling&k)!=0&&Board[i+3]==Side*Rook&&Board[i+1]==0&&Board[i+2]==0&&!Attacked(i+1,-Side)&&!Attacked(i+2,-Side))yield return new ChessMove(i,i+2);
                    if((Castling&q)!=0&&Board[i-4]==Side*Rook&&Board[i-1]==0&&Board[i-2]==0&&Board[i-3]==0&&!Attacked(i-1,-Side)&&!Attacked(i-2,-Side))yield return new ChessMove(i,i-2);
                }
            }
        }
        IEnumerable<ChessMove> PawnMove(int from,int to)
        {if(to/8==0||to/8==7){foreach(int p in new[]{Queen,Rook,Bishop,Knight})yield return new ChessMove(from,to,p);}else yield return new ChessMove(from,to);}
        public bool IsCheck(int side){int king=Array.IndexOf(Board,side*King);return king<0||Attacked(king,-side);}
        public bool Attacked(int square,int attacker)
        {
            int x=square%8,y=square/8;
            for(int i=0;i<64;i++)
            {
                int p=Board[i];if(p*attacker<=0)continue;int dx=x-i%8,dy=y-i/8,a=Math.Abs(dx),b=Math.Abs(dy);p=Math.Abs(p);
                if(p==Pawn){if(b==1&&dy==attacker&&a==1)return true;continue;}
                if(p==Knight){if(a*b==2)return true;continue;}
                if(p==King){if(Math.Max(a,b)==1)return true;continue;}
                bool diagonal=a==b&&a>0,straight=(dx==0) != (dy==0);
                if(!(p==Queen&&(diagonal||straight)||p==Bishop&&diagonal||p==Rook&&straight))continue;
                int steps=Math.Max(a,b),sx=Math.Sign(dx),sy=Math.Sign(dy);bool clear=true;
                for(int d=1;d<steps;d++)if(Board[i+d*sx+d*sy*8]!=0){clear=false;break;}if(clear)return true;
            }return false;
        }
        string PositionKey()
        {
            // Only a legal en-passant option distinguishes repetition positions.
            int ep=-1;
            if(EnPassant>=0)foreach(var m in PseudoMoves())if(m.To==EnPassant&&Math.Abs(Board[m.From])==Pawn){var g=PositionCopy();g.Apply(m);if(!g.IsCheck(Side)){ep=EnPassant;break;}}
            var b=new StringBuilder(80);foreach(int p in Board)b.Append((char)('g'+p));return b.Append('/').Append(Side).Append('/').Append(Castling).Append('/').Append(ep).ToString();
        }
        void Evaluate()
        {
            if(LegalMoves().Count==0){Finish(InCheck?-Side:0,InCheck?(-Side==1?"White":"Black")+" wins by checkmate":"Draw · stalemate");return;}
            if(InsufficientMaterial()){Finish(0,"Draw · insufficient mating material");return;}
            if(HalfMoves>=150){Finish(0,"Draw · 75-move rule");return;}
            if(Repetitions>=5)Finish(0,"Draw · fivefold repetition");
        }
        public bool InsufficientMaterial()
        {
            int minors=0,bishops=0,color=-1;bool same=true;
            for(int i=0;i<64;i++){int p=Math.Abs(Board[i]);if(p==0||p==King)continue;if(p==Pawn||p==Rook||p==Queen)return false;minors++;if(p==Bishop){bishops++;int c=(i%8+i/8)%2;if(color>=0&&color!=c)same=false;color=c;}}
            return minors<=1||bishops==minors&&same;
        }
        public bool ClaimDraw(){if(!CanClaimDraw)return false;Finish(0,HalfMoves>=100?"Draw · 50-move claim":"Draw · threefold repetition claim");return true;}
        public void AgreeDraw(){if(!Finished)Finish(0,"Draw by agreement");}
        public void Resign(int side){if(!Finished)Finish(-side,(-side==1?"White":"Black")+" wins by resignation");}
        void Finish(int winner,string result){Finished=true;Winner=winner;Result=result;Revision++;}
        public long Perft(int depth){if(depth==0)return 1;long n=0;foreach(var m in LegalMoves()){var g=PositionCopy();g.Apply(m);n+=g.Perft(depth-1);}return n;}
        public ChessMove? BestMove(int depth=3,int budget=20000)
        {
            if(Finished)return null;var moves=LegalMoves();if(moves.Count==0)return null;
            moves.Sort((a,b)=>MoveValue(b).CompareTo(MoveValue(a)));int best=-1000000,nodes=0;ChessMove chosen=moves[0];
            foreach(var m in moves){var g=PositionCopy();g.Apply(m);int score=-g.Search(depth-1,-1000000,-best,ref nodes,budget,1);if(score>best){best=score;chosen=m;}}
            return chosen;
        }
        int MoveValue(ChessMove m)=>Math.Abs(Board[m.To])*100+m.Promotion*100+(Math.Abs(Board[m.From])==Pawn?3:0);
        int Search(int depth,int alpha,int beta,ref int nodes,int budget,int ply)
        {
            nodes++;var moves=LegalMoves();if(moves.Count==0)return InCheck?-100000+ply:0;
            if(InsufficientMaterial()||HalfMoves>=100)return 0;
            if(depth<=0||nodes>budget)return Evaluation();
            moves.Sort((a,b)=>MoveValue(b).CompareTo(MoveValue(a)));
            foreach(var m in moves){var g=PositionCopy();g.Apply(m);int v=-g.Search(depth-1,-beta,-alpha,ref nodes,budget,ply+1);if(v>=beta)return beta;if(v>alpha)alpha=v;}return alpha;
        }
        int Evaluation()
        {
            int[] values={0,100,320,330,500,900,0};int score=0;
            for(int i=0;i<64;i++)if(Board[i]!=0){int side=Math.Sign(Board[i]),p=Math.Abs(Board[i]);int center=14-(Math.Abs(i%8*2-7)+Math.Abs(i/8*2-7));int positional=p==Pawn?(side==1?i/8:7-i/8)*7:p==Knight||p==Bishop?center*3:0;score+=side*(values[p]+positional);}return score*Side;
        }
    }
}
