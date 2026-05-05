import{c as e,p as t}from"./index-DDon5mHu.js";var n=t(),r=`#ff0000`,i=`#0000ff`,a=`#00ff00`,o=e.div`
  background: linear-gradient(${r}, ${i});
  width: 200px;
  height: 100px;
`,s=e.div`
  background: radial-gradient(${r}, ${i});
  width: 200px;
  height: 100px;
`,c=e.div`
  background: conic-gradient(${r}, ${i}, ${a});
  width: 200px;
  height: 100px;
`,l=e.div`
  background: repeating-linear-gradient(${r} 0%, ${i} 10%);
  width: 200px;
  height: 100px;
`,u=e.div`
  transform: translateY(-50%) translateX(${e=>e.$expanded?`0`:`-8px`}) scale(${e=>e.$expanded?1:.9});
  opacity: ${e=>+!!e.$expanded};
`,d=()=>(0,n.jsxs)(n.Fragment,{children:[(0,n.jsx)(o,{children:`Linear`}),(0,n.jsx)(s,{children:`Radial`}),(0,n.jsx)(c,{children:`Conic`}),(0,n.jsx)(l,{children:`Repeating`}),(0,n.jsx)(u,{$expanded:!0,children:`Expanded`}),(0,n.jsx)(u,{$expanded:!1,children:`Collapsed`})]});export{d as App};