import"./react-D4cBbUL-.js";import{f as e,s as t}from"./index-Dda2rlA_.js";var n=e(),r=`#ff0000`,i=`#0000ff`,a=`#00ff00`,o=t.div`
  background: linear-gradient(${r}, ${i});
  width: 200px;
  height: 100px;
`,s=t.div`
  background: radial-gradient(${r}, ${i});
  width: 200px;
  height: 100px;
`,c=t.div`
  background: conic-gradient(${r}, ${i}, ${a});
  width: 200px;
  height: 100px;
`,l=t.div`
  background: repeating-linear-gradient(${r} 0%, ${i} 10%);
  width: 200px;
  height: 100px;
`,u=t.div`
  transform: translateY(-50%) translateX(${e=>e.$expanded?`0`:`-8px`}) scale(${e=>e.$expanded?1:.9});
  opacity: ${e=>e.$expanded?1:0};
`,d=()=>(0,n.jsxs)(n.Fragment,{children:[(0,n.jsx)(o,{children:`Linear`}),(0,n.jsx)(s,{children:`Radial`}),(0,n.jsx)(c,{children:`Conic`}),(0,n.jsx)(l,{children:`Repeating`}),(0,n.jsx)(u,{$expanded:!0,children:`Expanded`}),(0,n.jsx)(u,{$expanded:!1,children:`Collapsed`})]});export{d as App};