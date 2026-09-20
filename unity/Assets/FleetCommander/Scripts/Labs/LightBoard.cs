using System;
using System.Collections.Generic;
using UnityEngine;
using FleetCommander.Core;
namespace FleetCommander.Labs
{
    [Serializable] public sealed class LightBoard
    {
        public const int Width=32,Height=24;
        public int[] pegs=new int[Width*Height];
        [NonSerialized] public int revision;
        public void Validate(){if(pegs==null||pegs.Length!=Width*Height)throw new ArgumentException("A board must have 32 × 24 pegs.");for(int i=0;i<pegs.Length;i++)if(pegs[i]<0||pegs[i]>9)throw new ArgumentException("Invalid peg color.");}
        public void Set(int x,int y,int color){if(x<0||y<0||x>=Width||y>=Height)return;pegs[y*Width+x]=Mathf.Clamp(color,0,9);revision++;}
        public void Clear(){Array.Clear(pegs,0,pegs.Length);revision++;}
        public void Example(string name)
        {
            Clear();for(int y=0;y<Height;y++)for(int x=0;x<Width;x++){float u=(x-15.5f)/10,v=(11.5f-y)/9;bool on=name=="Rainbow"?y>4&&y<20:name=="Circuit"?x%5==0||y%5==0:Mathf.Pow(u*u+v*v-1,3)-u*u*v*v*v<0;if(on)pegs[y*Width+x]=name=="Heart"?5:1+(x/4+y/5)%9;}revision++;
        }
        public ArtPoint[] Points()
        {Validate();var p=new List<ArtPoint>();for(int y=0;y<Height;y++)for(int x=0;x<Width;x++)if(pegs[y*Width+x]>0)p.Add(new ArtPoint{position=new Vector3((x-15.5f)*2,(11.5f-y)*2,0),color=Rendering.DroneRenderer.Palette[pegs[y*Width+x]-1]});return p.ToArray();}
    }
}
