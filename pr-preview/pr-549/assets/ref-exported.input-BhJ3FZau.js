import{s as e,t}from"./jsx-runtime-D4ePz0Hl.js";import{m as n,u as r}from"./index-CCTmqkNy.js";var i=e(n(),1),a=t(),o=r.input`
  padding: 0.5em;
  margin: 0.5em;
  color: #bf4f74;
  background: papayawhip;
  border: none;
  border-radius: 3px;
`,s=r.div`
  padding: 16px;
  background: #f0f0f0;
  border: 1px solid #ccc;
`,c=()=>{let e=i.useRef(null),t=i.useRef(null);return i.useEffect(()=>{e.current?.focus()},[]),(0,a.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:8,padding:16},children:[(0,a.jsx)(o,{ref:e,placeholder:`Focused on mount`}),(0,a.jsx)(s,{ref:t,children:`Div with ref`})]})};export{c as App,s as StyledDiv,o as StyledInput};