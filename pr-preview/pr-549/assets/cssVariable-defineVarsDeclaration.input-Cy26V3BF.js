import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{u as t}from"./index-BHFfZhDz.js";var n=e(),r=t.div`
  ${e=>e.$menuWidth?`--menu-width: ${e.$menuWidth}px`:``};
  width: var(--menu-width, 240px);
  padding: 8px;
  background: #fef3c7;
`,i=t.div`
  --foo-bar: 100px;
  --fooBar: 80px;
  width: var(--foo-bar, 100px);
  height: var(--fooBar, 80px);
  background: #dbeafe;
`,a=t.div`
  --menu-width: 180px;
  width: var(--menu-width, 240px);
  padding: 8px;
  background: #fee2e2;
`,o=()=>(0,n.jsxs)(`div`,{style:{display:`grid`,gap:8,padding:12},children:[(0,n.jsx)(r,{children:`Default width`}),(0,n.jsx)(r,{$menuWidth:320,children:`Custom width`}),(0,n.jsx)(i,{children:`Collision names`}),(0,n.jsx)(a,{children:`Alternate width`})]});export{o as App};