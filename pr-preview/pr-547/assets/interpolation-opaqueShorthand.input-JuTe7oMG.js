import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{m as t,u as n}from"./index-BxLvfPmy.js";t();var r=e();function i(e){return(0,r.jsx)(`input`,{...e})}var a=n.input`
  padding: ${e=>e.theme.inputPadding};
  padding-left: 0;
  background-color: white;
  border: 1px solid #ccc;
`,o=n.input`
  border: ${e=>e.theme.inputBorder};
  border-radius: 4px;
  background-color: white;
`,s=n(i)`
  border: ${e=>e.theme.inputBorder};
  border-radius: 4px;
  background-color: white;
`,c=()=>(0,r.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:8,padding:16},children:[(0,r.jsx)(a,{placeholder:`With directional padding`}),(0,r.jsx)(o,{placeholder:`With token border`}),(0,r.jsx)(s,{placeholder:`Wrapped token border`})]});export{c as App};