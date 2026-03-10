import{r as e,j as r,c as o}from"./index-DiiVsJ3U.js";const t=o.input`
  padding: 0.5em;
  margin: 0.5em;
  color: #bf4f74;
  background: papayawhip;
  border: none;
  border-radius: 3px;
`,c=o.div`
  padding: 16px;
  background: #f0f0f0;
  border: 1px solid #ccc;
`,i=()=>{const n=e.useRef(null),s=e.useRef(null);return e.useEffect(()=>{n.current?.focus()},[]),r.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:8,padding:16},children:[r.jsx(t,{ref:n,placeholder:"Focused on mount"}),r.jsx(c,{ref:s,children:"Div with ref"})]})};export{i as App,c as StyledDiv,t as StyledInput};
