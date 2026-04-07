import{o as e}from"./chunk-zsgVPwQN.js";import{t}from"./react-D4cBbUL-.js";import{f as n,s as r}from"./index-D-s1CKya.js";e(t(),1);var i=n(),a=r.div`
  &:hover {
    background-color: ${e=>e.theme.color[e.$hoverColor]};
  }
  background-color: ${e=>e.theme.color[e.$bg]};
  width: 42px;
  height: 100%;
  padding: 16px;
`,o=()=>(0,i.jsxs)(i.Fragment,{children:[(0,i.jsx)(a,{$bg:`labelBase`,$hoverColor:`labelMuted`}),(0,i.jsx)(a,{$bg:`labelMuted`,$hoverColor:`labelBase`})]}),s=r.span`
  color: ${e=>e.theme.color[e.color]};
`,c=r.div`
  background-color: ${e=>e.theme.color[e.bg]};
  ${e=>e.$active&&`background-color: red;`}
  padding: 8px;
`;function l(){return(0,i.jsxs)(`div`,{style:{display:`flex`,gap:8},children:[(0,i.jsx)(c,{bg:`labelBase`,children:`Inactive`}),(0,i.jsx)(c,{bg:`labelBase`,$active:!0,children:`Active (should be red)`})]})}export{o as App,l as OrderedApp,s as TextColor};