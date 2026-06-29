import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{u as t}from"./index-D4sd2IJq.js";var n=`--item-min-width`,r=`--item-max-width`,i=`--item-gap`,a=`--item-padding`,o=e(),s=t.div`
  ${`--item-min-width`}: 100%;
  background-color: orange;
  color: white;
  padding: 8px;
`,c=t.div`
  width: var(--item-min-width);
  background-color: teal;
  color: white;
  padding: 8px;
`,l=t.div`
  ${n}: 50%;
  background-color: indigo;
  color: white;
  padding: 8px;
`,u=t.div`
  ${n}: 75%;
  background-color: crimson;
  color: white;
  padding: 8px;
`,d=t.div`
  ${r}: 90%;
  background-color: darkslateblue;
  color: white;
  padding: 8px;
`,f=t.div`
  ${i}: 12px;
  background-color: seagreen;
  color: white;
  padding: 8px;
`,p=t.div`
  ${a}: 16px;
  background-color: chocolate;
  color: white;
  padding: 8px;
`;function m(){return(0,o.jsx)(t.div`
    ${`--locally-shadowed-name`}: 100%;
    background-color: darkorange;
    color: white;
    padding: 8px;
  `,{children:`Sets --locally-shadowed-name from local shadow`})}function h(){for(let e of[`--loop-name`])if(e===``)return null;return(0,o.jsx)(t.div`
    ${`--outer-loop-name`}: 25%;
    background-color: mediumvioletred;
    color: white;
    padding: 8px;
  `,{children:`Sets --outer-loop-name after loop scope`})}var g=()=>(0,o.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:`8px`},children:[(0,o.jsx)(s,{children:`Sets --item-min-width: 100%`}),(0,o.jsx)(c,{children:`Reads var(--item-min-width)`}),(0,o.jsx)(l,{children:`Sets --item-min-width via imported constant`}),(0,o.jsx)(u,{children:`Sets --item-min-width via barrel re-export`}),(0,o.jsx)(d,{children:`Sets --item-max-width via barrel star re-export`}),(0,o.jsx)(f,{children:`Sets --item-gap via directory-style barrel`}),(0,o.jsx)(p,{children:`Sets --item-padding via local-const re-export`}),(0,o.jsx)(m,{}),(0,o.jsx)(h,{})]});export{g as App};