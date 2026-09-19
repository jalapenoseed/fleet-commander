using System;
using System.Collections.Generic;
using System.IO;
using FleetCommander.Core;
using UnityEngine;
namespace FleetCommander.Systems
{
    public static class ArtStudio
    {
        const string Alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!?- .";
        static readonly string[] Glyphs={
            "01110100011000111111100011000110001","11110100011000111110100011000111110","01111100001000010000100001000001111","11110100011000110001100011000111110",
            "11111100001000011110100001000011111","11111100001000011110100001000010000","01111100001000010111100011000101111","10001100011000111111100011000110001",
            "11111001000010000100001000010011111","00111000100001000010000101001001100","10001100101010011000101001001010001","10000100001000010000100001000011111",
            "10001110111010110101100011000110001","10001110011010110011100011000110001","01110100011000110001100011000101110","11110100011000111110100001000010000",
            "01110100011000110001101011001001101","11110100011000111110101001001010001","01111100001000001110000010000111110","11111001000010000100001000010000100",
            "10001100011000110001100011000101110","10001100011000110001100010101000100","10001100011000110101101011101110001","10001100010101000100010101000110001",
            "10001100010101000100001000010000100","11111000010001000100010001000011111","01110100011001110101110011000101110","00100011000010000100001000010001110",
            "01110100010000100010001000100011111","11110000010000101110000010000111110","00010001100101010010111110001000010","11111100001111000001000011000101110",
            "01110100001000011110100011000101110","11111000010001000100010000100001000","01110100011000101110100011000101110","01110100011000101111000010000101110",
            "00100001000010000100001000000000100","01110100010000100010001000000000100","00000000000000011111000000000000000","00000000000000000000000000000000000","00000000000000000000000000000000100"};
        public static ArtPoint[] Text(string text)
        {
            text=(text??"").Trim().ToUpperInvariant();if(text.Length==0||text.Length>40)throw new ArgumentException("Use 1–40 letters, digits, or one supported symbol.");
            if(text=="❤"||text=="❤️"||text=="⭐"||text=="★"||text=="🙂"||text=="😀"||text=="🤖")return Symbol(text);
            var points=new List<ArtPoint>();int width=text.Length*6-1;
            for(int k=0;k<text.Length;k++)
            {
                int g=Alphabet.IndexOf(text[k]);if(g<0)throw new ArgumentException("Supported: A–Z, 0–9, ! ? - . and heart, star, smile, robot symbols.");
                for(int y=0;y<7;y++)for(int x=0;x<5;x++)if(Glyphs[g][y*5+x]=='1')points.Add(new ArtPoint{position=new Vector3((k*6+x-width*.5f)*2,(3-y)*2,0),color=Color.white});
            }
            return points.ToArray();
        }
        static ArtPoint[] Symbol(string name)
        {
            var p=new List<ArtPoint>();
            for(int y=-15;y<=15;y++)for(int x=-15;x<=15;x++)
            {
                float u=x/14f,v=y/14f;bool on;Color color;
                if(name.StartsWith("❤")){float q=u*u+v*v-1;on=q*q*q-u*u*v*v*v<0;color=new Color(1,.15f,.3f);}
                else if(name=="⭐"||name=="★"){float r=Mathf.Sqrt(u*u+v*v),a=Mathf.Atan2(v,u);on=r<.7f+.28f*Mathf.Cos(a*5-Mathf.PI/2);color=Color.yellow;}
                else {on=u*u+v*v<.9f;bool eye=Mathf.Abs(Mathf.Abs(u)-.32f)<.12f&&Mathf.Abs(v-.25f)<.15f;bool mouth=Mathf.Abs(v+.35f-u*u*.4f)<.08f&&Mathf.Abs(u)<.55f;color=eye||mouth?new Color(.04f,.04f,.08f):name=="🤖"?Color.cyan:Color.yellow;}
                if(on)p.Add(new ArtPoint{position=new Vector3(x*1.5f,y*1.5f,0),color=color});
            }
            return p.ToArray();
        }
        public static ArtPoint[] Image(string path,string mode,float threshold)
        {
            var info=new FileInfo(path);if(!info.Exists||info.Length>8000000)throw new ArgumentException("Choose a PNG/JPG under 8 MB.");
            var texture=new Texture2D(2,2,TextureFormat.RGBA32,false);
            try
            {
                if(!ImageConversion.LoadImage(texture,File.ReadAllBytes(path)))throw new ArgumentException("Could not decode image.");
                int width=64,height=Mathf.Clamp(Mathf.RoundToInt(64f*texture.height/texture.width),2,64);
                var pixels=new Color[width*height];for(int y=0;y<height;y++)for(int x=0;x<width;x++)pixels[y*width+x]=texture.GetPixelBilinear((x+.5f)/width,(y+.5f)/height);
                var points=new List<ArtPoint>();
                for(int y=0;y<height;y++)for(int x=0;x<width;x++)
                {
                    Color c=pixels[y*width+x];if(c.a<.1f)continue;
                    float edge=0;foreach(var d in new[]{Vector2Int.left,Vector2Int.right,Vector2Int.up,Vector2Int.down})edge=Mathf.Max(edge,Mathf.Abs(c.grayscale-pixels[Mathf.Clamp(y+d.y,0,height-1)*width+Mathf.Clamp(x+d.x,0,width-1)].grayscale));
                    bool on=mode=="Outline"?edge>=threshold:mode=="Silhouette"?c.grayscale<=threshold:c.grayscale>=threshold;
                    if(on)points.Add(new ArtPoint{position=new Vector3((x-(width-1)*.5f)*2,(y-(height-1)*.5f)*2,0),color=mode=="RGB"?c:Color.white});
                }
                if(points.Count==0)throw new ArgumentException("No lit pixels; adjust the threshold.");return points.ToArray();
            }
            finally{UnityEngine.Object.Destroy(texture);}
        }
    }
}
