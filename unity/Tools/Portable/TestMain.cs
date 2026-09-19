using System;
using System.Reflection;
using NUnit.Framework;
namespace FleetCommander.Portable
{
    static class TestMain
    {
        static int Main()
        {
            int passed=0,failed=0;
            foreach(var type in Assembly.GetExecutingAssembly().GetTypes())
            {
                if(type.Namespace!="FleetCommander.Tests")continue;
                var instance=Activator.CreateInstance(type);
                foreach(var method in type.GetMethods())
                {
                    var cases=method.GetCustomAttributes(typeof(TestCaseAttribute),false);
                    if(cases.Length==0&&method.GetCustomAttributes(typeof(TestAttribute),false).Length==0)continue;
                    int count=Math.Max(1,cases.Length);
                    for(int i=0;i<count;i++)
                    {
                        try{method.Invoke(instance,cases.Length==0?new object[0]:((TestCaseAttribute)cases[i]).Arguments);passed++;Console.WriteLine("PASS "+method.Name+(count>1?" ["+i+"]":""));}
                        catch(Exception e){failed++;Console.WriteLine("FAIL "+method.Name+" "+(e.InnerException??e));}
                    }
                }
            }
            Console.WriteLine("PORTABLE CPU CHECKS: "+passed+" passed, "+failed+" failed. System.Numerics adapter; Unity engine execution still required.");
            return failed==0?0:1;
        }
    }
}
