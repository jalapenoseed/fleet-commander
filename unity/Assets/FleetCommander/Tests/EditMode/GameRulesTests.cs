using System;
using FleetCommander.Core;
using FleetCommander.Games;
using NUnit.Framework;
using UnityEngine;
namespace FleetCommander.Tests
{
    public sealed class GameRulesTests
    {
        static ChessMove M(string from,string to,int promote=0)=>new ChessMove(ChessGame.ParseSquare(from),ChessGame.ParseSquare(to),promote);
        [Test] public void ChessInitialPerftMatchesReference(){var g=new ChessGame();Assert.AreEqual(20,g.Perft(1));Assert.AreEqual(400,g.Perft(2));Assert.AreEqual(8902,g.Perft(3));}
        [Test] public void FoolsMateEndsAndRejectsFurtherMoves(){var g=new ChessGame();Assert.True(g.Move(M("f2","f3")));Assert.True(g.Move(M("e7","e5")));Assert.True(g.Move(M("g2","g4")));Assert.True(g.Move(M("d8","h4")));Assert.True(g.Finished);Assert.AreEqual(-1,g.Winner);Assert.False(g.Move(M("a2","a3")));}
        [Test] public void CastlingCannotCrossAttackedSquare(){var g=new ChessGame();g.Setup("4kr2/8/8/8/8/8/8/R3K2R w KQ - 0 1");Assert.False(g.LegalMoves().Contains(M("e1","g1")));Assert.True(g.LegalMoves().Contains(M("e1","c1")));Assert.True(g.Move(M("e1","c1")));Assert.AreEqual(ChessGame.Rook,g.Board[3]);}
        [Test] public void EnPassantCannotExposeOwnKing(){var g=new ChessGame();g.Setup("k3r3/8/8/3pP3/8/8/8/4K3 w - d6 0 1");Assert.False(g.LegalMoves().Contains(M("e5","d6")));}
        [Test] public void LegalEnPassantRemovesCorrectPawn(){var g=new ChessGame();g.Setup("k7/8/8/3pP3/8/8/8/4K3 w - d6 0 1");Assert.True(g.Move(M("e5","d6")));Assert.AreEqual(0,g.Board[ChessGame.ParseSquare("d5")]);}
        [Test] public void PromotionHasFourChoicesAndAllowsKnight(){var g=new ChessGame();g.Setup("7k/P7/8/8/8/8/8/4K3 w - - 0 1");Assert.AreEqual(4,g.LegalMoves().FindAll(m=>m.From==48).Count);Assert.True(g.Move(M("a7","a8",ChessGame.Knight)));Assert.AreEqual(ChessGame.Knight,g.Board[56]);}
        [Test] public void StalemateIsDraw(){var g=new ChessGame();g.Setup("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");Assert.True(g.Finished);Assert.AreEqual(0,g.Winner);StringAssert.Contains("stalemate",g.Result);}
        [Test] public void RepetitionClaimAndFivefoldAutomatic(){var g=new ChessGame();for(int round=0;round<2;round++){g.Move(M("g1","f3"));g.Move(M("g8","f6"));g.Move(M("f3","g1"));g.Move(M("f6","g8"));}Assert.True(g.CanClaimDraw);Assert.False(g.Finished);for(int round=0;round<2;round++){g.Move(M("g1","f3"));g.Move(M("g8","f6"));g.Move(M("f3","g1"));g.Move(M("f6","g8"));}Assert.True(g.Finished);StringAssert.Contains("fivefold",g.Result);}
        [Test] public void SeventyFiveMoveRuleEndsGame(){var g=new ChessGame();g.Setup("7k/8/8/8/8/8/8/R3K3 w - - 149 76");Assert.True(g.Move(M("a1","a2")));Assert.True(g.Finished);StringAssert.Contains("75",g.Result);}
        [Test] public void AiSelectsLegalMoveAndDoesNotMutateBoard(){var g=new ChessGame();var ai=g.BestMove(2,2000);Assert.True(ai.HasValue);Assert.True(g.LegalMoves().Contains(ai.Value));Assert.AreEqual(1,g.Side);Assert.AreEqual(0,g.History.Count);}
        [TestCase(SportKind.Soccer)][TestCase(SportKind.CaptureTheFlag)][TestCase(SportKind.FlagFootball)][TestCase(SportKind.TagDuel)][TestCase(SportKind.KingOfHill)]
        public void SportsClockEndsAndFreezesResults(SportKind kind){var g=new SportsMatch(kind,new FleetConfig(),30);for(int i=0;i<1900;i++)g.Tick(1f/60);Assert.True(g.Finished);Assert.GreaterOrEqual(g.Winner,0);int a=g.BlueScore,b=g.RedScore;for(int i=0;i<120;i++)g.Tick(1f/60);Assert.AreEqual(a,g.BlueScore);Assert.AreEqual(b,g.RedScore);}
        [Test] public void SoccerGoalScoresOnceAndRestartsOtherTeam(){var g=new SportsMatch(SportKind.Soccer,new FleetConfig(),60);int player=g.Carrier;var s=g.World.States[player];s.position=new Vector3(47,3.3f,0);g.World.States[player]=s;g.World.SetControlledDrone(player);g.Tick(1f/60);Assert.True(g.Act(player,true));for(int i=0;i<90;i++)g.Tick(1f/60);Assert.AreEqual(1,g.BlueScore);Assert.AreEqual(0,g.RedScore);Assert.AreEqual(1,g.Carrier%2);}
        [Test] public void FootballTouchdownScoresSix(){var g=new SportsMatch(SportKind.FlagFootball,new FleetConfig(),60);int id=g.Carrier;var s=g.World.States[id];s.position=new Vector3(51,3.3f,0);g.World.States[id]=s;g.Tick(1f/60);Assert.AreEqual(6,g.BlueScore);Assert.AreEqual(1,g.Possession);Assert.AreEqual(1,g.Down);}
        [Test] public void FootballPlayClockTurnsOverAfterFourDowns(){var g=new SportsMatch(SportKind.FlagFootball,new FleetConfig(),120);int original=g.Possession;for(int k=0;k<4;k++){g.World.SetControlledDrone(g.Carrier);g.World.Config.speed=0;for(int i=0;i<1320;i++)g.Tick(1f/60);}Assert.AreEqual(1-original,g.Possession);}
        [Test] public void SportsSetupDeploysAndDoesNotMutateLiveRoster()
        {
            var setup=new SportsSettings{targetScore=2};setup.blue.frames[1]=FrameKind.Cargo;setup.blue.formation=SportFormation.Custom;setup.blue.slots[1]=new Vector2(-21,17);
            var game=new SportsMatch(SportKind.Soccer,new FleetConfig(),90,null,setup);Assert.AreEqual(FrameKind.Cargo,game.World.States[2].frame);Assert.AreEqual(17,game.World.States[2].position.z);
            setup.blue.frames[1]=FrameKind.Scout;setup.targetScore=90;Assert.AreEqual(FrameKind.Cargo,game.Settings.blue.frames[1]);game.AddPoints(0,2);Assert.True(game.Finished);Assert.AreEqual(0,game.Winner);game.AddPoints(1,99);Assert.AreEqual(0,game.RedScore);
        }
        [Test] public void LegacySportsSetupKeepsItsOriginalGame()
        {
            var setup=new SportsSettings{sport=SportKind.CaptureTheFlag};var json=JsonUtility.ToJson(setup);Assert.AreEqual(SportKind.CaptureTheFlag,SportsSettings.Parse(json).sport);
            json=json.Replace("\"schema\":2,","").Replace("\"sport\":1","\"sport\":0");Assert.AreEqual(SportKind.CaptureTheFlag,SportsSettings.Parse(json).sport);
            Assert.Throws<ArgumentException>(()=>SportsSettings.Parse(JsonUtility.ToJson(new SportsSettings{schema=99})));
        }
        [Test] public void FootballGainRenewsDownsAndMovesYellowLine()
        {
            var game=new SportsMatch(SportKind.FlagFootball,new FleetConfig(),180);game.World.Config.speed=0;int carrier=game.Carrier;game.World.SetControlledDrone(carrier);
            for(int i=1;i<10;i+=2){var foe=game.World.States[i];foe.position.z=29;game.World.States[i]=foe;}
            var d=game.World.States[carrier];d.position=new Vector3(-8,3.3f,0);game.World.States[carrier]=d;
            for(int i=0;i<1220;i++)game.Tick(1f/60);Assert.AreEqual(0,game.Possession);Assert.AreEqual(1,game.Down);Assert.AreEqual(12,game.FirstDownLine,.1f);StringAssert.Contains("FIRST DOWN",game.Event);
        }
        [Test] public void MixedTeamRolesDeployAndSettingsCloneIsIndependent(){var settings=new BattleSettings();settings.bluePlan.Preset(0,"Heavy escort");var w=new FleetWorld(new FleetConfig(),16,settings);var frames=new System.Collections.Generic.HashSet<FrameKind>();for(int i=0;i<16;i+=2)frames.Add(w.States[i].frame);Assert.GreaterOrEqual(frames.Count,3);var copy=settings.Clone();copy.bluePlan.roles[0].frame=FrameKind.Cargo;Assert.AreEqual(FrameKind.Scout,settings.bluePlan.roles[0].frame);}
        [Test] public void NoSensorsNeverRevealTarget(){var lab=new AdaptiveDuelLab();lab.Reset(new AdaptiveLabSettings{blueSensors=SensorKind.None});var a=DroneState.Create(0,0,Vector3.zero);var b=DroneState.Create(1,1,Vector3.forward*10);for(int i=0;i<100;i++)Assert.False(lab.Observe(a,b,i*.05f,.05f).detected);Assert.False(lab.TryGetTrack(0,1,out _));}
        [Test] public void LearningIsRetainedAcrossBoundMatches(){var memory=new AdaptiveKnowledge();var first=new AdaptiveDuelLab();first.Reset(new AdaptiveLabSettings());memory.Bind(first,"Soccer",13);first.Policy(0).Complete(1);var second=new AdaptiveDuelLab();second.Reset(new AdaptiveLabSettings());memory.Bind(second,"Soccer",13);Assert.AreEqual(1,second.Policy(0).rounds);Assert.AreSame(first.Policy(0),second.Policy(0));}
        [Test] public void FlagCaptureRequiresOwnFlagHome()
        {
            var g=new SportsMatch(SportKind.CaptureTheFlag,new FleetConfig(),60);g.World.Config.speed=0;
            for(int i=0;i<10;i++){var d=g.World.States[i];d.position=new Vector3(i%2==0?-20:20,3.3f,20);g.World.States[i]=d;}
            g.FlagCarrier[1]=0;g.FlagHome[1]=false;g.FlagHome[0]=false;g.Flags[0]=new Vector3(0,3.3f,-25);
            var runner=g.World.States[0];runner.position=SportsMatch.Base(0);g.World.States[0]=runner;g.Tick(1f/60);Assert.AreEqual(0,g.BlueScore);
            g.FlagHome[0]=true;g.Flags[0]=SportsMatch.Base(0);g.Tick(1f/60);Assert.AreEqual(1,g.BlueScore);Assert.True(g.FlagHome[0]&&g.FlagHome[1]);
        }
        [Test] public void ToyProjectileUsesTravelAndNetDisablesWithoutArcadeDamage()
        {
            var rules=new BattleSettings();rules.lab.agentsPerTeam=1;var g=new SportsMatch(SportKind.TagDuel,new FleetConfig(),60,rules);g.World.Config.speed=0;
            var a=g.World.States[0];a.position=new Vector3(0,10,0);g.World.States[0]=a;var b=g.World.States[1];b.position=new Vector3(0,10,10);g.World.States[1]=b;
            g.Toy.Projectiles.Add(new ToyProjectile{position=new Vector3(0,10,0),velocity=Vector3.forward*18,source=0,target=1,kind=ToyEffectorKind.Net});
            g.Tick(1f/60);Assert.AreEqual(0,g.BlueScore);for(int i=0;i<45;i++)g.Tick(1f/60);Assert.AreEqual(1,g.BlueScore);Assert.Greater(g.Stunned[1],0);Assert.AreEqual(100,g.World.States[1].health);Assert.AreEqual(0,g.World.BlueDamage);
        }
        [Test] public void HillScoresOnlyUncontestedOccupation()
        {
            var rules=new BattleSettings();rules.lab.agentsPerTeam=1;rules.lab.blueEffector=rules.lab.redEffector=ToyEffectorKind.Ram;var g=new SportsMatch(SportKind.KingOfHill,new FleetConfig(),60,rules);g.World.Config.speed=0;
            var a=g.World.States[0];a.position=new Vector3(0,6,0);g.World.States[0]=a;var b=g.World.States[1];b.position=new Vector3(5,6,0);g.World.States[1]=b;
            for(int i=0;i<90;i++)g.Tick(1f/60);Assert.AreEqual(0,g.BlueScore);Assert.AreEqual(0,g.RedScore);b=g.World.States[1];b.position=new Vector3(30,6,0);g.World.States[1]=b;for(int i=0;i<90;i++)g.Tick(1f/60);Assert.Greater(g.BlueScore,0);
        }
    }
}
