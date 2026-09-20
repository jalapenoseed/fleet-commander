using FleetCommander.Core;
using UnityEngine;
namespace FleetCommander.Rendering
{
    public static class ScenePackPlacement
    {
        public static int Placed {get;private set;}
        static readonly string[] Houses={"GR05_01_UtilityHouse","GR05_02_RoadsideStore","GR05_03_TexasHouse","GR05_04_Maintenance","GR05_05_CreekPump"};
        static GameObject Place(Transform parent,FleetConfig c,string name,Vector3 p,float yaw=0,float scale=1)
        {
            var asset=Resources.Load<GameObject>("ScenePacks/"+name);if(!asset){Debug.LogWarning("Missing scene pack asset "+name);return null;}
            var o=Object.Instantiate(asset,parent);o.name=name;o.transform.localPosition=p+Vector3.up*SceneryTerrain.Height(c,p.x,p.z);o.transform.localRotation=Quaternion.Euler(0,yaw,0);o.transform.localScale=Vector3.one*scale;Placed++;return o;
        }
        public static void Build(Transform parent,FleetConfig c)
        {
            Placed=0;if(c.planet!=PlanetKind.Earth)return;
            if(c.scenery==SceneryKind.RuralTown||c.scenery==SceneryKind.City||c.scenery==SceneryKind.Alpine)
            {
                for(int i=0;i<14;i++){float x=(i/2-3)*37,z=i%2==0?192:252;Place(parent,c,Houses[i%Houses.Length],new Vector3(x,0,z),i%2==0?0:180,1.5f);}
            }
            else if(c.scenery==SceneryKind.Metro){for(int i=0;i<6;i++)Place(parent,c,Houses[i%4],new Vector3(-150+i*60,0,185),0,1.7f);}
            else if(c.scenery==SceneryKind.Harbor){for(int i=0;i<6;i++)Place(parent,c,Houses[i%2==0?3:4],new Vector3(165,1.2f,-140+i*55),-90,1.6f);}
            else if(c.scenery==SceneryKind.Creek)Place(parent,c,Houses[4],new Vector3(210,0,80),-90,1.5f);
            else if(c.scenery==SceneryKind.Meadow||c.scenery==SceneryKind.Overlook||c.scenery==SceneryKind.Desert||c.scenery==SceneryKind.ForestLake){Place(parent,c,Houses[2],new Vector3(-145,0,175),20,1.5f);Place(parent,c,Houses[0],new Vector3(-190,0,175),20,1.3f);}
            // Original camp assets form a furnished field operations compound beside the flight volume.
            Vector3 origin=c.scenery==SceneryKind.Harbor?new Vector3(135,1.2f,-75):new Vector3(-115,0,95);
            string[] props={"GR_TarpShelter_02","GR_Workbench_02","GR_FoldingChair_02","GR_CampCot_02","GR_SolarArray_02","GR_ChargingStation_02","GR_DroneHardCase_02","GR_FieldRadio_02","GR_BatteryCase_02","GR_FirstAidCase_02","GR_SupplyLocker_02","GR_WaterBarrel_02","GR_WaterFilter_02","GR_SupplyCrate_02","GR_Toolboard_02","GR_ExtensionReel_02","GR_CampStove_02","GR_RainCollector_02","GR_FieldStorageCase_02","GR_BikeRepairStand_02"};
            for(int i=0;i<props.Length;i++)Place(parent,c,props[i],origin+new Vector3((i%5)*4,0,(i/5)*5),i%2*90,1.35f);
            string[] ops={"GR_FO_01","GR_FO_02","GR_FO_03","GR_FO_04","GR_FO_05","GR_FO_06","GR_FO_07","GR_FO_08","GR_FO_09","GR_FO_10"};
            for(int i=0;i<ops.Length;i++)Place(parent,c,ops[i],origin+new Vector3((i%5)*3,0,-6-(i/5)*3),0,1.4f);
        }
    }
}
