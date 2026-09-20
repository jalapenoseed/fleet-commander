using System;
using FleetCommander.Core;
using FleetCommander.Cameras;
using NUnit.Framework;
using UnityEngine;

namespace FleetCommander.Tests
{
    public sealed class GameRecoveryTests
    {
        static int Sq(string square)=>(square[1]-'1')*8+square[0]-'a';
        static void Move(ChessGame g,string from,string to,int promotion=5)=>Assert.IsTrue(g.Move(Sq(from),Sq(to),promotion),from+to);
        [Test] public void ChessStartsWithTwentyLegalMovesAndRejectsBadMoves()
        {
            var g=new ChessGame();Assert.AreEqual(20,g.LegalMoves().Count);Assert.IsFalse(g.Move(Sq("a1"),Sq("a4")));Assert.IsFalse(g.Move(Sq("e7"),Sq("e5")));
            Move(g,"e2","e4");Assert.AreEqual(20,g.LegalMoves().Count);Assert.AreEqual(-1,g.Turn);
        }
        [Test] public void ChessFoolsMateEndsAndLocksBoard()
        {
            var g=new ChessGame();Move(g,"f2","f3");Move(g,"e7","e5");Move(g,"g2","g4");Move(g,"d8","h4");Assert.AreEqual(ChessResult.Checkmate,g.Result);Assert.IsFalse(g.Move(Sq("a2"),Sq("a3")));
        }
        [Test] public void ChessCastlingMovesRookAndRemovesRights()
        {
            var g=new ChessGame();g.LoadFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");Move(g,"e1","g1");Assert.AreEqual(4,g.Board[Sq("f1")]);Assert.AreEqual(0,g.Board[Sq("h1")]);Assert.AreEqual(0,g.Castling&3);
            Move(g,"e8","c8");Assert.AreEqual(-4,g.Board[Sq("d8")]);
        }
        [Test] public void ChessCannotCastleThroughCheck()
        {
            var g=new ChessGame();g.LoadFen("4kr2/8/8/8/8/8/8/4K2R w K - 0 1");Assert.IsFalse(g.Move(Sq("e1"),Sq("g1")));
        }
        [Test] public void ChessEnPassantExpiresAndCannotExposeKing()
        {
            var g=new ChessGame();Move(g,"e2","e4");Move(g,"a7","a6");Move(g,"e4","e5");Move(g,"d7","d5");Move(g,"e5","d6");Assert.AreEqual(0,g.Board[Sq("d5")]);Assert.AreEqual(1,g.Board[Sq("d6")]);
            g.LoadFen("k3r3/8/8/3pP3/8/8/8/4K3 w - d6 0 1");Assert.IsFalse(g.Move(Sq("e5"),Sq("d6")));
            g.LoadFen("k7/8/8/3pP3/8/8/8/4K3 w - d6 0 1");Move(g,"e1","f1");Move(g,"a8","b8");Assert.IsFalse(g.Move(Sq("e5"),Sq("d6")));
        }
        [Test] public void ChessPromotionOffersFourChoices()
        {
            var g=new ChessGame();g.LoadFen("7k/P7/8/8/8/8/8/7K w - - 0 1");Assert.AreEqual(4,g.LegalMoves(Sq("a7")).Count);Move(g,"a7","a8",2);Assert.AreEqual(2,g.Board[Sq("a8")]);
        }
        [Test] public void ChessDrawConditionsAreRecognized()
        {
            var g=new ChessGame();g.LoadFen("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");Assert.AreEqual(ChessResult.Stalemate,g.Result);
            g.LoadFen("7k/8/8/8/8/8/8/6NK w - - 0 1");Assert.AreEqual(ChessResult.InsufficientMaterial,g.Result);
            g.LoadFen("7k/8/8/8/8/8/P7/7K w - - 100 1");Assert.AreEqual(ChessResult.FiftyMoves,g.Result);
            g.Reset();for(int i=0;i<2;i++){Move(g,"g1","f3");Move(g,"g8","f6");Move(g,"f3","g1");Move(g,"f6","g8");}Assert.AreEqual(ChessResult.Repetition,g.Result);
        }
        [Test] public void ChessAiFindsMateAndNeverChangesBoardWhileThinking()
        {
            var g=new ChessGame();g.LoadFen("7k/8/5KQ1/8/8/8/8/8 w - - 0 1");var before=(int[])g.Board.Clone();var move=g.Suggest();CollectionAssert.AreEqual(before,g.Board);Assert.IsTrue(move.HasValue);Assert.IsTrue(g.Move(move.Value.from,move.Value.to,move.Value.promotion));Assert.AreEqual(ChessResult.Checkmate,g.Result);
        }
        [Test] public void PinnedChessPieceCannotExposeKing()
        {
            var g=new ChessGame();g.LoadFen("k3r3/8/8/8/8/8/4R3/4K3 w - - 0 1");Assert.IsFalse(g.Move(Sq("e2"),Sq("d2")));Move(g,"e2","e8");
        }
        static void Advance(SportsMatch game,float seconds){for(int i=0;i<Mathf.CeilToInt(seconds*60);i++)game.Step(1f/60);}
        [TestCase(SportKind.CaptureTheFlag)] [TestCase(SportKind.Soccer)] [TestCase(SportKind.FlagFootball)]
        public void SportsCompleteAndFreezeWithinClock(SportKind sport)
        {
            var game=new SportsMatch(new SportsSettings{sport=sport,seconds=30,targetScore=99});Advance(game,31);
            Assert.IsTrue(game.Ended);Assert.AreEqual(0,game.Remaining);var before=game.World.States[0].position;int score=game.BlueScore+game.RedScore;Advance(game,4);Assert.AreEqual(before,game.World.States[0].position);Assert.AreEqual(score,game.BlueScore+game.RedScore);
            foreach(var state in game.World.States)Assert.IsTrue(FleetConfig.Finite(state.position));
        }
        [Test] public void SoccerOnlyScoresInsideGoalAndEndsAtTarget()
        {
            var g=new SportsMatch(new SportsSettings{sport=SportKind.Soccer,targetScore=1});Advance(g,1.5f);
            g.Ball=new Vector3(49.9f,1.2f,20);g.BallVelocity=Vector3.right*20;g.Step(.1f);Assert.AreEqual(0,g.BlueScore);
            g.Ball=new Vector3(49.9f,1.2f,0);g.BallVelocity=Vector3.right*20;g.Step(.1f);Assert.AreEqual(1,g.BlueScore);Assert.AreEqual(0,g.Winner);
        }
        [Test] public void CaptureRequiresOwnFlagHome()
        {
            var g=new SportsMatch(new SportsSettings{sport=SportKind.CaptureTheFlag,targetScore=1});Advance(g,1.5f);
            g.FlagCarrier[1]=0;g.FlagCarrier[0]=5;g.World.States[0].position=SportsMatch.Base(0);g.World.States[5].position=Vector3.zero;g.Step(.01f);Assert.AreEqual(0,g.BlueScore);
            g.FlagCarrier[0]=-1;g.Step(.01f);Assert.AreEqual(1,g.BlueScore);Assert.AreEqual(0,g.Winner);
        }
        [Test] public void TaggedFlagCarrierReturnsFlagWithoutDamage()
        {
            var g=new SportsMatch(new SportsSettings{sport=SportKind.CaptureTheFlag});Advance(g,1.5f);g.FlagCarrier[1]=0;g.World.States[0].position=Vector3.up*2.5f;g.World.States[5].position=Vector3.up*2.5f;g.Step(.01f);Assert.AreEqual(-1,g.FlagCarrier[1]);Assert.AreEqual(100,g.World.States[0].health);
        }
        [Test] public void FootballTouchdownAndDownsHaveRuleBasedValues()
        {
            var g=new SportsMatch(new SportsSettings{sport=SportKind.FlagFootball,targetScore=6});Advance(g,1.6f);g.World.States[g.Carrier].position=new Vector3(50.5f,2.5f,0);g.Step(.01f);Assert.AreEqual(6,g.BlueScore);Assert.IsTrue(g.Ended);
            g=new SportsMatch(new SportsSettings{sport=SportKind.FlagFootball});
            for(int down=1;down<=4;down++){Advance(g,1.6f);int carrier=g.Carrier;g.World.States[carrier].position=new Vector3(-35,2.5f,0);g.World.States[5].position=g.World.States[carrier].position;g.Step(.01f);}
            Assert.AreEqual(1,g.Possession);Assert.AreEqual(1,g.Down);
        }
        [Test] public void SportsRosterIsClonedAndValidationRejectsBadSlots()
        {
            var settings=new SportsSettings();settings.blue.frames[1]=FrameKind.Cargo;var g=new SportsMatch(settings);settings.blue.frames[1]=FrameKind.Relay;Assert.AreEqual(FrameKind.Cargo,g.World.States[1].frame);Assert.IsFalse(g.World.IsBattle);
            settings.blue.slots[0]=new Vector2(float.NaN,0);Assert.Throws<ArgumentException>(()=>settings.Validate());
        }
        [TestCase(SportKind.CaptureTheFlag)] [TestCase(SportKind.Soccer)] [TestCase(SportKind.FlagFootball)]
        public void AutomaticSportsCanScoreWithinNormalMatch(SportKind sport)
        {
            var settings=new SportsSettings{sport=sport,seconds=180,targetScore=99};settings.blue.formation=SportFormation.Wide;
            var game=new SportsMatch(settings);Advance(game,181);Assert.Greater(game.BlueScore+game.RedScore,0,"A complete game must produce scoring play.");
        }
        [Test] public void SportsAndBattlePreserveShowFleetAndCameraFitIsFinite()
        {
            var obj=new GameObject("Recovery integration");var cam=new GameObject("Test camera");
            try
            {
                var sim=obj.AddComponent<SwarmSimulator>();if(sim.Show==null)typeof(SwarmSimulator).GetMethod("Awake",System.Reflection.BindingFlags.NonPublic|System.Reflection.BindingFlags.Instance).Invoke(sim,null);var show=sim.Show;var before=show.States[0].position;sim.StartSports(new SportsSettings());sim.Tick(.016f);Assert.AreSame(show,sim.Show);Assert.AreEqual(before,show.States[0].position);
                var rig=cam.AddComponent<DroneCameraRig>();rig.Simulator=sim;rig.Fit();Assert.AreEqual(CameraMode.Orbit,rig.Mode);Assert.IsTrue(FleetConfig.Finite(rig.Focus));Assert.Greater(rig.Distance,100);
                sim.StartBattle(4);Assert.IsNull(sim.Sports);sim.EndBattle();Assert.AreSame(show,sim.Active);
            }
            finally{UnityEngine.Object.DestroyImmediate(obj);UnityEngine.Object.DestroyImmediate(cam);}
        }
    }
}
