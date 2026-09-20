using System;
using System.Collections;
using System.IO;
using FleetCommander.Core;
using FleetCommander.Cameras;
using FleetCommander.Systems;
using UnityEngine;
using UnityEngine.UIElements;

namespace FleetCommander.UI
{
    public sealed partial class CommanderUI
    {
        public readonly ChessGame Chess=new ChessGame();
        readonly MatchResults GameResults=new MatchResults();bool chessRecorded;
        public SportsSettings SportsSetup=new SportsSettings();
        VisualElement chessPanel,chessGrid,chessBackdrop;Button restoreMenu;Label sportsScore,chessStatus,chessHistory;
        int chessSelected=-1,promotion=5;bool chessAI=true,chessThinking,chessWasPaused;string previousGamePage;
        public bool MenusHidden=>hidden;
        void InitializeGames()
        {
            GameResults.Load();Simulator.OnSportsFinished+=RecordSportsResult;
            restoreMenu=Button(Root,"SHOW MENUS  [H]",ToggleUI,"restore-menu");restoreMenu.name="restore-menus";restoreMenu.style.display=DisplayStyle.None;
            chessBackdrop=new VisualElement();chessBackdrop.AddToClassList("chess-backdrop");chessBackdrop.pickingMode=PickingMode.Ignore;Root.Insert(0,chessBackdrop);chessBackdrop.style.display=DisplayStyle.None;
            chessPanel=Element(Root,"chess-panel");chessPanel.name="chess-panel";chessPanel.style.display=DisplayStyle.None;
        }
        void RecordSportsResult(SportsMatch match)=>GameResults.Add(match.Settings.sport.ToString(),match.BlueScore,match.RedScore,match.Winner,match.Event);
        void GamePageChanged(string page)
        {
            if(previousGamePage=="Chess"&&page!="Chess")Simulator.Paused=chessWasPaused;
            if(previousGamePage!="Chess"&&page=="Chess"){chessWasPaused=Simulator.Paused;Simulator.Paused=true;Pilot?.LeavePilot();}
            previousGamePage=page;if(chessBackdrop!=null)chessBackdrop.style.display=page=="Chess"?DisplayStyle.Flex:DisplayStyle.None;if(chessPanel!=null)chessPanel.style.display=page=="Chess"?DisplayStyle.Flex:DisplayStyle.None;
            sportsScore=null;
        }
        void CameraControls()
        {
            Section("Manual camera");EnumField("View",Rig.Mode,v=>{Pilot?.LeavePilot();Rig.SetMode(v);});
            Toggle("Follow fleet center",Rig.TrackFleet,v=>Rig.TrackFleet=v);
            Slider("Distance",Rig.Distance,10,650,v=>Rig.Distance=v);Slider("Yaw",Rig.Yaw,-180,180,v=>Rig.Yaw=v);Slider("Pitch",Rig.Pitch,5,85,v=>Rig.Pitch=v);
            var orbit=Row();Button(orbit,"← ORBIT",()=>Rig.Yaw-=15);Button(orbit,"ORBIT →",()=>Rig.Yaw+=15);
            var zoom=Row();Button(zoom,"ZOOM +",()=>Rig.Distance=Mathf.Max(3,Rig.Distance*.8f));Button(zoom,"ZOOM −",()=>Rig.Distance=Mathf.Min(1000,Rig.Distance*1.25f));
            Button(content,"FRAME ALL DRONES",()=>{Pilot?.LeavePilot();Rig.Fit();});
            Button(content,"FREE CAMERA · WASD / Q / E",()=>{Pilot?.LeavePilot();Rig.SetMode(CameraMode.Free);});
            Note("Drag the flight view to orbit. Middle-drag or Shift + drag pans; scrolling zooms. Free camera: WASD move, Q/E descend/ascend. Camera works while paused.");
        }
        void SportsPage()
        {
            Note("Five drones per team. Mix the existing detailed aircraft and assign sports roles and formations. Matches use a separate fleet; all aircraft have equal sports speed regardless of model.");
            sportsScore=Label(content,"","scoreboard");
            EnumField("Sport",SportsSetup.sport,v=>{SportsSetup.sport=v;SportsSetup.targetScore=v==SportKind.FlagFootball?21:3;OpenPage("Sports");});
            Slider("Match length · s",SportsSetup.seconds,30,600,v=>SportsSetup.seconds=v);
            var target=new IntegerField("Score to win"){value=SportsSetup.targetScore};content.Add(target);target.RegisterValueChangedCallback(e=>SportsSetup.targetScore=Mathf.Clamp(e.newValue,1,99));
            Button(content,"START / REMATCH",StartSports,"primary");
            Button(content,"PAUSE / RESUME",TogglePause);
            Button(content,"RETURN TO SHOW FLEET",()=>{Simulator.EndBattle();Rig.Fit();OpenPage("Fleet");});
            switch(SportsSetup.sport)
            {
                case SportKind.Soccer:Note("Arcade soccer: cross the opponent's goal line between the posts for 1 point. Boundary boards rebound the ball. First to the target or leading at full time wins; equal scores draw.");break;
                case SportKind.CaptureTheFlag:Note("Take the opposite flag and bring it to your base while your own flag is home. A defender tagging a carrier returns the flag and sends the runner home for 3 seconds. Each capture is 1 point.");break;
                case SportKind.FlagFootball:Note("Arcade flag football: touchdowns earn 6 points. Four downs to advance 20 field units; the yellow line marks the next first down. Flag pulls and a 20-second play clock end the play. One forward pass per play, with interceptions and turnovers on downs. No kicks or extra points.");break;
            }
            foreach(int team in new[]{0,1})
            {
                var roster=team==0?SportsSetup.blue:SportsSetup.red;string label=team==0?"Blue":"Red";
                Section(label+" roster & formation");EnumField(label+" formation",roster.formation,v=>{roster.formation=v;OpenPage("Sports");});EnumField(label+" skin",roster.skin,v=>roster.skin=v);
                for(int i=0;i<5;i++)
                {
                    int slot=i;EnumField(label+" "+(i+1)+" model",roster.frames[i],v=>roster.frames[slot]=v);EnumField(label+" "+(i+1)+" role",roster.roles[i],v=>roster.roles[slot]=v);
                    if(roster.formation==SportFormation.Custom)
                    {Slider(label+" "+(i+1)+" depth",-roster.slots[i].x,1,46,v=>roster.slots[slot].x=-v);Slider(label+" "+(i+1)+" lane",roster.slots[i].y,-27,27,v=>roster.slots[slot].y=v);}
                }
            }
            Note("Setup edits apply to the next match. Runner/support/defender roles affect soccer and capture-the-flag positioning. Football uses your formation for starting lanes and scripted passing routes.");
            Button(content,"SAVE SPORTS SETUP",()=>{SportsSetup.Validate();File.WriteAllText(Path.Combine(Application.persistentDataPath,"sports.json"),JsonUtility.ToJson(SportsSetup,true));Simulator.Notice="Sports setup saved.";});
            Button(content,"LOAD SPORTS SETUP",()=>{var loaded=JsonUtility.FromJson<SportsSettings>(File.ReadAllText(Path.Combine(Application.persistentDataPath,"sports.json")));if(loaded==null)throw new ArgumentException("Invalid sports setup.");loaded.Validate();SportsSetup=loaded;OpenPage("Sports");});
            CameraControls();UpdateSportsHud();
        }
        public void StartSports()
        {
            ResetChallenge();Pilot?.LeavePilot();Simulator.StartSports(SportsSetup);Rig.Fit();OpenPage("Sports");
        }
        void UpdateSportsHud()
        {
            var game=Simulator.Sports;
            string text=game==null?"SPORTS LAB · READY":game.Settings.sport.ToString().ToUpperInvariant()+"   "+ClockText(game.Remaining)+"\nBLUE  "+game.BlueScore+"  :  "+game.RedScore+"  RED\n"+game.Event;
            if(game!=null&&game.Settings.sport==SportKind.FlagFootball)text+="\n"+(game.Possession==0?"Blue":"Red")+" ball · Down "+game.Down+" / 4 · "+Mathf.Abs(game.FirstDownLine-game.Scrimmage).ToString("F0")+" to gain · Play "+game.PlayRemaining.ToString("F0")+"s";
            if(sportsScore!=null)sportsScore.text=text+"\n"+GameResults.Tally((game!=null?game.Settings.sport:SportsSetup.sport).ToString());
            if(game!=null&&Page!="Chess")
            {
                combatHud.style.display=DisplayStyle.Flex;roundBanner.text=text;pilotInfo.text=game.Ended?"Sports → Start / Rematch":"Five players per team · Score target or full time";
                roundBanner.EnableInClassList("blue-winner",game.Winner==0);roundBanner.EnableInClassList("red-winner",game.Winner==1);
            }
        }
        void ChessPage()
        {
            Note("Select a piece, then a highlighted legal destination. White moves first. P pawn · N knight · B bishop · R rook · Q queen · K king.");
            Toggle("Play against AI (Black)",chessAI,v=>{chessAI=v;});
            Choice("Promote pawn to",new[]{"Queen","Rook","Bishop","Knight"},promotion==5?"Queen":promotion==4?"Rook":promotion==3?"Bishop":"Knight",v=>promotion=v=="Queen"?5:v=="Rook"?4:v=="Bishop"?3:2);
            Button(content,"NEW GAME",()=>{Chess.Reset();chessRecorded=false;chessSelected=-1;RefreshChess();},"primary");
            Button(content,"FLIP BOARD",()=>{chessFlipped=!chessFlipped;RefreshChess();});
            Note("Includes castling, en passant, promotion, checkmate and stalemate. This local game automatically draws on threefold repetition, 50 moves without a pawn move/capture, or insufficient material. AI searches two plies; no network or account needed.");
            chessHistory=Label(content,"","note");RefreshChess();
        }
        bool chessFlipped;
        public void RefreshChess()
        {
            if(chessPanel==null)return;
            if(Chess.Result!=ChessResult.Playing&&!chessRecorded){chessRecorded=true;int winner=Chess.Result==ChessResult.Checkmate?(Chess.Turn<0?0:1):2;GameResults.Add("Chess",winner==0?1:0,winner==1?1:0,winner,Chess.Status);}
            chessPanel.Clear();
            chessStatus=Label(chessPanel,Chess.Status,"chess-status");Label(chessPanel,chessAI?"LOCAL CHESS  /  YOU: WHITE · AI: BLACK":"LOCAL CHESS  /  TWO PLAYERS","eyebrow");Label(chessPanel,GameResults.Tally("Chess"),"eyebrow");
            chessGrid=Element(chessPanel,"chess-grid");chessGrid.name="chess-board";
            var legal=chessSelected<0?null:Chess.LegalMoves(chessSelected);
            for(int row=0;row<8;row++)
            {
                var line=Element(chessGrid,"chess-row");
                for(int col=0;col<8;col++)
                {
                    int square=chessFlipped?row*8+7-col:(7-row)*8+col;int piece=Chess.Board[square];
                    var button=Button(line,"",()=>ClickChess(square),"chess-square");button.name="square-"+ChessGame.Square(square);
                    button.EnableInClassList("light-square",(square%8+square/8)%2==1);button.EnableInClassList("chosen-square",square==chessSelected);
                    button.EnableInClassList("legal-square",legal!=null&&legal.Exists(m=>m.to==square));
                    var coordinate=Label(button,ChessGame.Square(square),"square-coordinate");coordinate.pickingMode=PickingMode.Ignore;
                    if(piece!=0){var token=Label(button,ChessGame.Letter(piece),piece>0?"white-piece":"black-piece");token.pickingMode=PickingMode.Ignore;}
                    button.tooltip=ChessGame.Square(square)+(piece==0?" empty":(piece>0?" White ":" Black ")+new[]{"","pawn","knight","bishop","rook","queen","king"}[Math.Abs(piece)]);
                }
            }
            if(chessHistory!=null)chessHistory.text=string.Join("\n",Chess.History.GetRange(Math.Max(0,Chess.History.Count-14),Math.Min(14,Chess.History.Count)));
            LayoutChess();
        }
        public void ClickChess(int square)
        {
            if(square<0||square>=64||Chess.Result!=ChessResult.Playing||chessThinking||chessAI&&Chess.Turn<0)return;
            if(chessSelected>=0&&Chess.Move(chessSelected,square,promotion))chessSelected=-1;
            else chessSelected=Math.Sign(Chess.Board[square])==Chess.Turn?square:-1;
            RefreshChess();
        }
        IEnumerator ThinkChess()
        {
            chessThinking=true;yield return new WaitForSecondsRealtime(.3f);
            if(Page=="Chess"&&chessAI&&Chess.Turn<0&&Chess.Result==ChessResult.Playing){var move=Chess.Suggest(2);if(move.HasValue)Chess.Move(move.Value.from,move.Value.to,move.Value.promotion);chessSelected=-1;RefreshChess();}
            chessThinking=false;
        }
        void LayoutChess()
        {
            if(chessGrid==null)return;float width=Root.resolvedStyle.width,height=Root.resolvedStyle.height;
            if(float.IsNaN(width)||width<=0||height<=0)return;
            float left=hidden?24:sidebar.resolvedStyle.width+56;float size=Mathf.Max(160,Mathf.Min(width-left-60,height-365));
            chessPanel.style.left=left+(width-left-size-40)*.5f;chessPanel.style.top=Mathf.Max(160,nav.layout.y+nav.resolvedStyle.height+12);chessPanel.style.width=size+32;
            chessGrid.style.width=size;chessGrid.style.height=size;
        }
        void UpdateGamePages()
        {
            if(Page=="Chess"){Simulator.Paused=true;LayoutChess();if(chessAI&&Chess.Turn<0&&!chessThinking&&Chess.Result==ChessResult.Playing)StartCoroutine(ThinkChess());}
            telemetry.style.display=hidden||Simulator.Sports!=null||Page=="Chess"?DisplayStyle.None:DisplayStyle.Flex;
        }
    }
}
