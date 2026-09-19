using System;
using System.IO;
using FleetCommander.Systems;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;
namespace FleetCommander.Editor
{
    public static class FleetBuild
    {
        const string Scene="Assets/FleetCommander/Scenes/FleetCommander.unity";
        [MenuItem("Fleet Commander/Open Main Scene")]
        public static void Open(){EditorSceneManager.OpenScene(Scene);}
        [MenuItem("Fleet Commander/Build Windows Player")]
        public static void BuildWindows()
        {
            Configure();string path=RuntimeSmoke.Argument("-fleetOutput",Path.GetFullPath("Builds/Windows/FleetCommander.exe"));Directory.CreateDirectory(Path.GetDirectoryName(path));
            var report=BuildPipeline.BuildPlayer(new BuildPlayerOptions{scenes=new[]{Scene},locationPathName=path,target=BuildTarget.StandaloneWindows64,options=BuildOptions.Development});
            File.WriteAllText(Path.Combine(Path.GetDirectoryName(path),"build-report.txt"),report.summary.result+"\nErrors: "+report.summary.totalErrors+"\nWarnings: "+report.summary.totalWarnings+"\nDuration: "+report.summary.totalTime);
            if(report.summary.result!=BuildResult.Succeeded)throw new Exception("Fleet Commander build failed: "+report.summary.result);
            Debug.Log("FLEET_BUILD_SUCCEEDED "+path);
        }
        [MenuItem("Fleet Commander/Configure Project")]
        public static void Configure()
        {
            PlayerSettings.companyName="Coin Crazy";PlayerSettings.productName="Fleet Commander";PlayerSettings.bundleVersion="1.0.0";
            PlayerSettings.colorSpace=ColorSpace.Linear;PlayerSettings.defaultScreenWidth=1600;PlayerSettings.defaultScreenHeight=900;PlayerSettings.fullScreenMode=FullScreenMode.Windowed;PlayerSettings.resizableWindow=true;PlayerSettings.runInBackground=true;
            PlayerSettings.SetScriptingBackend(UnityEditor.Build.NamedBuildTarget.Standalone,ScriptingImplementation.Mono2x);
            EditorBuildSettings.scenes=new[]{new EditorBuildSettingsScene(Scene,true)};
            AssetDatabase.SaveAssets();
        }
    }
}
