using System;
using System.Collections.Generic;
using System.Text;
namespace FleetCommander.Labs
{
    public enum GateKind { Input, Zero, One, AND, OR, NOT, XOR, NAND, NOR, XNOR }
    [Serializable] public sealed class LogicNode
    {public string name="Gate";public GateKind kind;public int a=-1,b=-1;public bool input;}
    [Serializable] public sealed class LogicCircuit
    {
        public List<LogicNode> nodes=new List<LogicNode>();
        public static int Arity(GateKind k)=>k==GateKind.Input||k==GateKind.Zero||k==GateKind.One?0:k==GateKind.NOT?1:2;
        public void Validate()
        {
            if(nodes==null||nodes.Count>24)throw new ArgumentException("Use at most 24 gates.");
            for(int i=0;i<nodes.Count;i++){var n=nodes[i];if(n==null||!Enum.IsDefined(typeof(GateKind),n.kind))throw new ArgumentException("Invalid gate.");int inputs=Arity(n.kind);if(inputs>0&&(n.a<0||n.a>=i)||inputs>1&&(n.b<0||n.b>=i))throw new ArgumentException("Wires must connect to earlier gates; feedback is not supported.");}
        }
        public bool[] Evaluate()
        {
            Validate();var values=new bool[nodes.Count];
            for(int i=0;i<nodes.Count;i++){var n=nodes[i];bool a=n.a>=0&&n.a<i&&values[n.a],b=n.b>=0&&n.b<i&&values[n.b];switch(n.kind){case GateKind.Input:values[i]=n.input;break;case GateKind.One:values[i]=true;break;case GateKind.AND:values[i]=a&&b;break;case GateKind.OR:values[i]=a||b;break;case GateKind.NOT:values[i]=!a;break;case GateKind.XOR:values[i]=a^b;break;case GateKind.NAND:values[i]=!(a&&b);break;case GateKind.NOR:values[i]=!(a||b);break;case GateKind.XNOR:values[i]=a==b;break;}}
            return values;
        }
        public int Add(string name,GateKind kind,int a=-1,int b=-1){if(nodes.Count>=24)throw new ArgumentException("24 gate limit reached.");nodes.Add(new LogicNode{name=name,kind=kind,a=a,b=b});try{Validate();}catch{nodes.RemoveAt(nodes.Count-1);throw;}return nodes.Count-1;}
        public static LogicCircuit Example(string name)
        {
            var c=new LogicCircuit();c.Add("A",GateKind.Input);c.Add("B",GateKind.Input);
            if(name=="Full adder"){c.Add("Carry in",GateKind.Input);c.Add("A XOR B",GateKind.XOR,0,1);c.Add("SUM",GateKind.XOR,3,2);c.Add("A AND B",GateKind.AND,0,1);c.Add("Carry path",GateKind.AND,3,2);c.Add("CARRY",GateKind.OR,5,6);}
            else if(name=="Multiplexer"){c.Add("Select",GateKind.Input);c.Add("NOT select",GateKind.NOT,2);c.Add("A path",GateKind.AND,0,3);c.Add("B path",GateKind.AND,1,2);c.Add("OUTPUT",GateKind.OR,4,5);}
            else if(name=="Alarm"){c.nodes[0].name="Door";c.nodes[1].name="Window";c.Add("Armed",GateKind.Input);c.Add("Any opening",GateKind.OR,0,1);c.Add("ALARM",GateKind.AND,3,2);}
            else{c.Add("SUM",GateKind.XOR,0,1);c.Add("CARRY",GateKind.AND,0,1);}
            return c;
        }
        public string TruthTable()
        {
            Validate();var inputs=new List<int>();for(int i=0;i<nodes.Count;i++)if(nodes[i].kind==GateKind.Input)inputs.Add(i);
            if(inputs.Count>8)throw new ArgumentException("Truth table supports up to 8 inputs.");var saved=new bool[inputs.Count];for(int i=0;i<inputs.Count;i++)saved[i]=nodes[inputs[i]].input;
            var text=new StringBuilder();foreach(var n in nodes)text.Append(n.name.Replace(","," ")).Append(',');text.AppendLine();
            try{for(int row=0;row<(1<<inputs.Count);row++){for(int i=0;i<inputs.Count;i++)nodes[inputs[i]].input=(row&(1<<i))!=0;foreach(bool value in Evaluate())text.Append(value?'1':'0').Append(',');text.AppendLine();}}
            finally{for(int i=0;i<inputs.Count;i++)nodes[inputs[i]].input=saved[i];}return text.ToString();
        }
    }
}
