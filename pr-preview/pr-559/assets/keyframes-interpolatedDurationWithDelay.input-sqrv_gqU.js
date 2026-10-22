import{t as e}from"./jsx-runtime-CF8L0Gwd.js";import{t}from"./react-lJqMpIaC.js";import{i as n,n as r}from"./styled-components.browser.esm-Dy4oaG3m.js";t();var i=e(),a=r`
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
`,o=n.span`
  animation: ${a} ${e=>e.$duration??200}ms 0.5s ease-out;
`;function s(){return(0,i.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:16,padding:16},children:[(0,i.jsx)(o,{children:`Default duration (200ms), delay (0.5s)`}),(0,i.jsx)(o,{$duration:800,children:`Custom duration (800ms), delay (0.5s)`})]})}export{s as App};