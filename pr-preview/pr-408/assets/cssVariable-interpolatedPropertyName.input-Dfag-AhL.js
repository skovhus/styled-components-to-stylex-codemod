import{f as e,s as t}from"./index-lcg58oev.js";var n=`--item-min-width`,r=`--item-max-width`,i=e(),a=t.div`
  ${`--item-min-width`}: 100%;
  background-color: orange;
  color: white;
  padding: 8px;
`,o=t.div`
  width: var(--item-min-width);
  background-color: teal;
  color: white;
  padding: 8px;
`,s=t.div`
  ${n}: 50%;
  background-color: indigo;
  color: white;
  padding: 8px;
`,c=t.div`
  ${n}: 75%;
  background-color: crimson;
  color: white;
  padding: 8px;
`,l=t.div`
  ${r}: 90%;
  background-color: darkslateblue;
  color: white;
  padding: 8px;
`,u=()=>(0,i.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:`8px`},children:[(0,i.jsx)(a,{children:`Sets --item-min-width: 100%`}),(0,i.jsx)(o,{children:`Reads var(--item-min-width)`}),(0,i.jsx)(s,{children:`Sets --item-min-width via imported constant`}),(0,i.jsx)(c,{children:`Sets --item-min-width via barrel re-export`}),(0,i.jsx)(l,{children:`Sets --item-max-width via barrel star re-export`})]});export{u as App};