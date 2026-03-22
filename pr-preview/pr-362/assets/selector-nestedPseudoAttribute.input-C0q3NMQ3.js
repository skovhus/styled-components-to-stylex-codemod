import"./react-D4cBbUL-.js";import{f as e,s as t}from"./index-DpzH6t4H.js";var n=e(),r=t.div`
  background-color: #f0f0f0;
  padding: 16px;
  overscroll-behavior: none;

  &:focus,
  &:focus-visible {
    outline: none;
    &[data-disable-focus-ring="true"] {
      box-shadow: none;
    }
  }
`,i=t.div`
  background-color: white;
  padding: 12px;
  border: 2px solid #ccc;

  &:hover {
    border-color: #bf4f74;
    &[data-muted="true"] {
      border-color: #ddd;
      opacity: 0.5;
    }
  }

  &:focus {
    outline: 2px solid blue;
    &[data-no-outline="true"] {
      outline: none;
    }
  }
`;function a(){return(0,n.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:16,padding:16},children:[(0,n.jsx)(r,{tabIndex:0,children:`Menu (focus me)`}),(0,n.jsx)(r,{tabIndex:0,"data-disable-focus-ring":`true`,children:`Menu (focus ring disabled)`}),(0,n.jsx)(i,{tabIndex:0,children:`Interactive Box`}),(0,n.jsx)(i,{tabIndex:0,"data-muted":`true`,children:`Interactive Box (muted)`}),(0,n.jsx)(i,{tabIndex:0,"data-no-outline":`true`,children:`Interactive Box (no outline)`})]})}export{a as App};