using System.Collections.Generic;
using UnityEngine;
using FleetCommander.Systems;
using FleetCommander.Games;
using System.Threading.Tasks;
namespace FleetCommander.Core
{
    public sealed class SwarmSimulator : MonoBehaviour
    {
        public SportsMatch Sports {get;private set;}
        public DroneRangeGame Range {get;private set;}
        public readonly Labs.ScienceLab Science=new Labs.ScienceLab();
        public Labs.LightBoard Board=new Labs.LightBoard();
        public Labs.LogicCircuit Circuit=Labs.LogicCircuit.Example("Half adder");
        public bool BoardInWorld;
        public ChessGame Chess {get;private set;}
        public bool ChessAI {get;private set;}
        public int ChessAISide {get;private set;}=-1;
        public bool ChessThinking=>chessTask!=null;
        public readonly MatchResults Results=new MatchResults();
        public readonly TacticsLearning Tactics=new TacticsLearning();
        public readonly AdaptiveKnowledge Knowledge=new AdaptiveKnowledge();
        Task<ChessMove?> chessTask; ChessGame thinkingGame;
        bool gameRecorded;
        public FleetWorld Show {get;private set;}
        public FleetWorld Arena {get;private set;}
        public FleetWorld Active => Arena ?? Show;
        public FleetConfig Config => Active.Config;
        public FleetConfig DisplayConfig => Replay.Playing ? Replay.DisplayConfig : Active.Config;
        public BattleSettings BattleSession {get;private set;} = new BattleSettings();
        public IReadOnlyList<DroneState> States => Active.States;
        public readonly ReplayBuffer Replay = new ReplayBuffer();
        public readonly CueProgram Program = new CueProgram();
        public bool Paused;
        public int Selected;
        public BehaviorStack Behaviors;
        public string Notice = "Fleet ready. Launch a show or open the battle arena.";
        public System.Action<BattleEvent> OnBattleEvent;
        public System.Action<FleetWorld> OnRoundFinished;
        float accumulator;
        int battlePerTeam=16;
        bool roundAnnounced;public bool SeriesRunning {get;private set;}public int SeriesCompleted {get;private set;}public int SeriesRoundLimit {get;private set;}=3;
        public float NextRoundIn {get;private set;}public float HitstopStrength=.5f;float hitPause;
        public void StartSeries(int perTeam){BattleSession.Validate();BattleSession.ResetScores();SeriesCompleted=0;SeriesRoundLimit=BattleSession.roundCount;SeriesRunning=true;StartBattle(perTeam);}
        public void StopSeries(){SeriesRunning=false;NextRoundIn=0;}
        public float DroppedSimulationSeconds {get;private set;}
        public const float FixedStep=1f/60;
        void Awake(){Show=new FleetWorld(new FleetConfig(),256); Show.Launch(); Behaviors.SetOnly(SwarmBehavior.Formation);}
        void Update()
        {
            if(Chess!=null){UpdateChess();return;}
            if(Replay.Playing){Arena?.ClearControl();Replay.Update(Time.unscaledDeltaTime);return;}
            if(Paused)return;
            if(SeriesRunning&&BattleSession.autoAdvance&&Arena!=null&&Arena.RoundEnded){if(NextRoundIn<=0)NextRoundIn=5;NextRoundIn-=Time.unscaledDeltaTime;if(NextRoundIn<=0){StartBattle(battlePerTeam);return;}}
            if(hitPause>0){hitPause-=Time.unscaledDeltaTime;return;}
            accumulator+=Mathf.Min(Time.deltaTime,.2f); int steps=0;
            while(accumulator>=FixedStep && steps++<6){Tick(FixedStep);accumulator-=FixedStep;}
            if(accumulator>=FixedStep){DroppedSimulationSeconds+=accumulator;accumulator=0;}
        }
        public void Tick(float dt)
        {
            if(Chess!=null){UpdateChess();return;}
            if(Range!=null){Range.Tick(dt);if(Range.Finished&&!gameRecorded){gameRecorded=true;Results.Add("Drone Range",Range.Score,0,Range.Score>0?0:2,Range.Status);Notice=Range.Status;}return;}
            if(Sports!=null)
            {
                Sports.Tick(dt);foreach(var e in Active.Events)OnBattleEvent?.Invoke(e);
                if(Sports.Finished&&!gameRecorded){gameRecorded=true;Knowledge.Finish(Arena.AdaptiveLab,Sports.Winner);Results.Add(Sports.Title,Sports.BlueScore,Sports.RedScore,Sports.Winner,Sports.Status);Notice=Sports.Status+" · "+Sports.ScoreText;}
                return;
            }
            if(Arena==null)Program.Step(dt,Show);
            Active.Step(dt);
            Replay.Record(Active,dt);
            foreach(var e in Active.Events){OnBattleEvent?.Invoke(e);if(e.impact&&e.victim==Selected)hitPause=Mathf.Min(.06f,HitstopStrength*.06f);if(e.destruction)Replay.Mark("Drone down",Active.Time);}
            if(Arena!=null && Arena.RoundEnded && !roundAnnounced)
            {
                roundAnnounced=true;Arena.ClearControl();Tactics.Finish(Arena);Tactics.Save();
                if(SeriesRunning){SeriesCompleted++;if(SeriesCompleted>=SeriesRoundLimit)SeriesRunning=false;else if(BattleSession.autoAdvance)NextRoundIn=5;}
                string result=Arena.Winner==0?"BLUE WINS":Arena.Winner==1?"RED WINS":"DRAW";
                Notice=result+" · Round kills "+Arena.BlueKills+"–"+Arena.RedKills+" · Series "+BattleSession.blueWins+"–"+BattleSession.redWins+" ("+BattleSession.draws+" draws). Rematch to play again.";
                Knowledge.Finish(Arena.AdaptiveLab,Arena.Winner);Replay.Mark(result,Arena.Time);Results.Add("Arena",Arena.BlueKills,Arena.RedKills,Arena.Winner,result);OnRoundFinished?.Invoke(Arena);
            }
        }
        public void Resize(int count){ExitReplay();EndBattle();Program.Stop();Show.Resize(count);Replay.Clear();Notice=count+" aircraft ready on the pads.";}
        public void LaunchAll(){if(Chess!=null||Sports!=null||Range!=null){Notice="Use the game controls to start a new match.";return;}ExitReplay();Active.Launch();Paused=false;Notice="Launch ordered.";}
        public void LandAll(){if(Chess!=null||Sports!=null||Range!=null){Notice="Return to the fleet before landing aircraft.";return;}ExitReplay();Program.Stop();Active.Recall();Notice="Returning to reserved landing pads.";}
        public void ClearBehaviors(){Behaviors.Clear();Config.ResetInfluences();Config.boids=false;Program.Stop();Notice="Motion patterns, fields, Boids and program stopped.";}
        public void StartBattle(int perTeam)
        {
            ExitReplay();Program.Stop();Arena?.ClearControl();Sports=null;Chess=null;Range=null;BattleSession.Validate();
            battlePerTeam=Mathf.Clamp(perTeam,1,128);
            var arenaConfig=JsonUtility.FromJson<FleetConfig>(JsonUtility.ToJson(Show.Config));
            Arena=new FleetWorld(arenaConfig,battlePerTeam*2,BattleSession);Knowledge.Bind(Arena.AdaptiveLab,"Arena",BattleSession.lab.seed+SeriesCompleted);Tactics.Bind(Arena,BattleSession.lab.seed+SeriesCompleted);Arena.Launch();
            Replay.Clear();Selected=0;Paused=false;accumulator=0;roundAnnounced=false;NextRoundIn=0;
            Notice="Arcade round started. Choose Join Blue / Red to fly into the fight.";
        }
        public void Rematch(){StartBattle(battlePerTeam);}
        public void ApplyArenaLoadouts(){Rematch();}
        public void ResetBattleScore()
        {
            BattleSession.blueWins=BattleSession.redWins=BattleSession.draws=0;
            Notice="Series score reset. The current round is unchanged.";
        }
        public void ResetBattleDefaults()
        {
            int blue=BattleSession.blueWins,red=BattleSession.redWins,draws=BattleSession.draws;
            BattleSession.ResetDefaults();BattleSession.blueWins=blue;BattleSession.redWins=red;BattleSession.draws=draws;
            Notice="Arena rules restored; rematch applies default loadouts. Series score retained.";
        }
        public void EndBattle(){StopSeries();Arena?.ClearControl();Arena=null;Sports=null;Chess=null;Range=null;Replay.Clear();Selected=0;accumulator=0;roundAnnounced=false;}
        public void ExitReplay(){Replay.Stop();}
        public void StartSports(SportKind kind,float seconds=180,SportsSettings setup=null)
        {
            EndBattle();Program.Stop();Sports=new SportsMatch(kind,Show.Config,seconds,BattleSession,setup);Arena=Sports.World;Knowledge.Bind(Arena.AdaptiveLab,Sports.Title,BattleSession.lab.seed);Selected=2;Paused=false;gameRecorded=false;accumulator=0;Notice=Sports.Rules;
        }
        public void StartRange(){EndBattle();Program.Stop();Range=new DroneRangeGame(Show.Config);Arena=Range.World;Selected=0;Paused=false;gameRecorded=false;Notice="Drone Range · blue score targets, amber targets cost points. Three timed stages.";}
        public void StartChess(bool ai,int humanSide=1)
        {
            EndBattle();Program.Stop();Chess=new ChessGame();ChessAI=ai;ChessAISide=-humanSide;Paused=false;gameRecorded=false;Notice="Chess · select a piece, then a highlighted square.";
        }
        void Start(){Results.Load();Knowledge.Load();Tactics.Load();}
        void UpdateChess()
        {
            if(Chess==null)return;
            if(Chess.Finished)
            {
                if(!gameRecorded){gameRecorded=true;Results.Add("Chess",Chess.Winner==1?1:0,Chess.Winner==-1?1:0,Chess.Winner==0?2:Chess.Winner==1?0:1,Chess.Result);Notice=Chess.Result;}
                return;
            }
            if(chessTask!=null)
            {
                if(!chessTask.IsCompleted)return;
                try{var move=chessTask.GetAwaiter().GetResult();if(!Paused&&thinkingGame==Chess&&Chess.Side==ChessAISide&&move.HasValue)Chess.Move(move.Value);}
                catch(System.Exception e){Debug.LogWarning("Chess AI: "+e.Message);}
                chessTask=null;thinkingGame=null;
            }
            if(!Paused&&ChessAI&&Chess.Side==ChessAISide){thinkingGame=Chess;var copy=Chess.Copy();chessTask=Task.Run(()=>copy.BestMove(3,18000));}
        }
        public bool PlayChess(ChessMove move)
        {
            if(Chess==null||Paused||Chess.Finished||ChessAI&&Chess.Side==ChessAISide)return false;bool ok=Chess.Move(move);if(ok)Notice=Chess.TurnText;return ok;
        }
        public void Payload()
        {
            if(Range!=null)return;
            if(Sports!=null){if(!Paused)Sports.Act(Selected,false);return;}
            if(Replay.Playing)return;
            if(Paused){Notice="Resume the arena before firing a pulse charge.";return;}
            int firstEvent=Active.Events.Count;
            if(Active.DropPayload(Selected))
            {
                for(int i=firstEvent;i<Active.Events.Count;i++){var e=Active.Events[i];OnBattleEvent?.Invoke(e);Replay.AddEvent(e);}
                Replay.Mark("Payload",Active.Time);
            }
            else Notice="Select an airborne arena drone with a pulse charge remaining.";
        }
        public void Load(FleetSave save)
        {
            FleetStorage.Validate(save); ExitReplay();EndBattle();Program.Stop();Show=new FleetWorld(save.config,0);Show.Restore(save.drones,save.elapsed);Paused=true;Selected=0;Notice="Fleet loaded. Resume when ready.";
        }
    }
}
