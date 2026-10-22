import{t as e}from"./jsx-runtime-CF8L0Gwd.js";import{t}from"./react-lJqMpIaC.js";import{i as n,n as r}from"./styled-components.browser.esm-Dy4oaG3m.js";t();var i=e(),a=r`
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
`,o=n.span`
  animation: ${a} ease-out ${e=>e.$fadeInDuration??200}ms;
`;function s(){return(0,i.jsxs)(`div`,{style:{display:`flex`,gap:16,padding:16},children:[(0,i.jsx)(o,{children:`Default (200ms)`}),(0,i.jsx)(o,{$fadeInDuration:500,children:`Custom (500ms)`})]})}export{s as App};