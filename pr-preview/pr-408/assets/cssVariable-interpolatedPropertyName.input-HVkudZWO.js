import{f as e,s as t}from"./index-ZQmbMZ0C.js";var n=`--item-min-width`,r=e(),i=t.div`
  ${`--item-min-width`}: 100%;
  background-color: orange;
  color: white;
  padding: 8px;
`,a=t.div`
  width: var(--item-min-width);
  background-color: teal;
  color: white;
  padding: 8px;
`,o=t.div`
  ${n}: 50%;
  background-color: indigo;
  color: white;
  padding: 8px;
`,s=()=>(0,r.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:`8px`},children:[(0,r.jsx)(i,{children:`Sets --item-min-width: 100%`}),(0,r.jsx)(a,{children:`Reads var(--item-min-width)`}),(0,r.jsx)(o,{children:`Sets --item-min-width via imported constant`})]});export{s as App};