import{c as e,p as t}from"./index-Bjkq5Iw9.js";import{S as n}from"./helpers-DMPONVDR.js";var r=t(),i=e.textarea`
  border: ${n(`bgBorderFaint`)};
  border-color: ${e=>e.$hasError?e.theme.color.greenBase:void 0};
  border-radius: 6px;

  &:focus {
    outline: none;
    border-color: ${e=>e.$hasError?e.theme.color.greenBase:e.theme.color.controlPrimary};
  }
`,a=()=>(0,r.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:8,padding:16},children:[(0,r.jsx)(i,{defaultValue:`default`}),(0,r.jsx)(i,{$hasError:!0,defaultValue:`error`})]});export{a as App};