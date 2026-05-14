import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{c as t,p as n}from"./index-1EbP8g-Z.js";n();var r=e();function i(e){return(0,r.jsx)(`input`,{...e})}var a=t.input`
  padding: ${e=>e.theme.inputPadding};
  padding-left: 0;
  background-color: white;
  border: 1px solid #ccc;
`,o=t.input`
  border: ${e=>e.theme.inputBorder};
  border-radius: 4px;
  background-color: white;
`,s=t(i)`
  border: ${e=>e.theme.inputBorder};
  border-radius: 4px;
  background-color: white;
`,c=()=>(0,r.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:8,padding:16},children:[(0,r.jsx)(a,{placeholder:`With directional padding`}),(0,r.jsx)(o,{placeholder:`With token border`}),(0,r.jsx)(s,{placeholder:`Wrapped token border`})]});export{c as App};