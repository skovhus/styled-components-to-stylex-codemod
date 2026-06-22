import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{u as t}from"./index-iPOnlJ5b.js";import{T as n}from"./helpers-B19cN2r4.js";var r=e(),i=t.textarea`
  border: ${n(`bgBorderFaint`)};
  border-color: ${e=>e.$hasError?e.theme.color.greenBase:void 0};
  border-radius: 6px;

  &:focus {
    outline: none;
    border-color: ${e=>e.$hasError?e.theme.color.greenBase:e.theme.color.controlPrimary};
  }
`,a=t.button`
  padding: 8px 16px;
  color: white;
  background-color: slategray;

  &:hover {
    background-color: ${e=>e.$hoverColor};
  }
`,o=t.button`
  padding: 8px 16px;
  color: white;
  background-color: slategray;

  &:hover {
    background-color: ${e=>e.$hoverColor};
  }
`,s=()=>(0,r.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:8,padding:16},children:[(0,r.jsx)(i,{defaultValue:`default`}),(0,r.jsx)(i,{$hasError:!0,defaultValue:`error`}),(0,r.jsx)(a,{$hoverColor:`tomato`,children:`Hover me (tomato)`}),(0,r.jsx)(a,{$hoverColor:`seagreen`,children:`Hover me (seagreen)`}),(0,r.jsx)(o,{children:`No hover prop (stays slategray)`}),(0,r.jsx)(o,{$hoverColor:`rebeccapurple`,children:`Hover me (purple)`})]});export{s as App};