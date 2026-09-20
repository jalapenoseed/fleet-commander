using System;
using UnityEngine;

using FleetCommander.Core;
namespace FleetCommander.Games
{
    public enum SportFormation { Balanced, Wide, Diamond, Defensive, Custom }
    public enum SportRole { Runner, Support, Defender }
    [Serializable] public sealed class SportsRoster
    {
        public SportFormation formation;
        public FrameKind[] frames = { FrameKind.Scout, FrameKind.Relay, FrameKind.Cargo, FrameKind.Utility, FrameKind.Scout };
        public SportRole[] roles = { SportRole.Runner, SportRole.Runner, SportRole.Support, SportRole.Defender, SportRole.Defender };
        public Vector2[] slots = { new Vector2(-8,0),new Vector2(-14,16),new Vector2(-14,-16),new Vector2(-30,12),new Vector2(-36,-10) };
        public SkinKind skin = SkinKind.Cobalt;
        public SportsRoster Clone() => new SportsRoster { formation=formation,skin=skin,frames=(FrameKind[])frames.Clone(),roles=(SportRole[])roles.Clone(),slots=(Vector2[])slots.Clone() };
        public Vector3 Slot(int index,int team)
        {
            Vector2 p=slots[index];
            if(formation==SportFormation.Wide)p=new Vector2(-10-index*6,(index-2)*12);
            if(formation==SportFormation.Diamond)p=new[]{new Vector2(-6,0),new Vector2(-20,19),new Vector2(-20,-19),new Vector2(-34,0),new Vector2(-43,0)}[index];
            if(formation==SportFormation.Defensive)p=new Vector2(-24-index*5,(index-2)*10);
            if(formation==SportFormation.Balanced)p=new[]{new Vector2(-8,0),new Vector2(-14,16),new Vector2(-14,-16),new Vector2(-30,12),new Vector2(-36,-10)}[index];
            return new Vector3(p.x*(team==0?1:-1),2.5f,p.y);
        }
    }
    [Serializable] public sealed class SportsSettings
    {
        public int schema=2;
        public SportKind sport;
        public float seconds=180;
        public int targetScore=3;
        public SportsRoster blue=new SportsRoster(),red=new SportsRoster { skin=SkinKind.Crimson };
        public static SportsSettings Parse(string json)
        {
            var settings=new SportsSettings();JsonUtility.FromJsonOverwrite(json,settings);
            // The recovery build used CTF=0 and Soccer=1 before the unified games enum.
            if(!System.Text.RegularExpressions.Regex.IsMatch(json,@"""schema""\s*:"))
            {if((int)settings.sport==0)settings.sport=SportKind.CaptureTheFlag;else if((int)settings.sport==1)settings.sport=SportKind.Soccer;settings.schema=2;}
            if(settings.schema!=2)throw new ArgumentException("Unsupported sports setup version.");settings.Validate();return settings;
        }
        public SportsSettings Clone()=>new SportsSettings{sport=sport,seconds=seconds,targetScore=targetScore,blue=blue.Clone(),red=red.Clone()};
        public void Validate()
        {
            if(!Enum.IsDefined(typeof(SportKind),sport)||float.IsNaN(seconds)||float.IsInfinity(seconds)||seconds<10||seconds>1800||targetScore<1||targetScore>99)throw new ArgumentException("Invalid sports rules.");
            foreach(var roster in new[]{blue,red})
            {
                if(roster==null||roster.frames==null||roster.roles==null||roster.slots==null||roster.frames.Length!=5||roster.roles.Length!=5||roster.slots.Length!=5||!Enum.IsDefined(typeof(SportFormation),roster.formation)||!Enum.IsDefined(typeof(SkinKind),roster.skin))throw new ArgumentException("Each sports team needs five valid slots.");
                for(int i=0;i<5;i++)if(!Enum.IsDefined(typeof(FrameKind),roster.frames[i])||!Enum.IsDefined(typeof(SportRole),roster.roles[i])||!FleetConfig.Finite(new Vector3(roster.slots[i].x,0,roster.slots[i].y))||roster.slots[i].x>0||roster.slots[i].x< -46||Mathf.Abs(roster.slots[i].y)>27)throw new ArgumentException("Sports slots must stay in their own half.");
            }
        }
    }
}
