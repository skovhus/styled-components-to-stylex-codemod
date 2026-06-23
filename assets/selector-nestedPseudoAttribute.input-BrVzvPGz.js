import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{u as t}from"./index-2bKrsGD9.js";var n=e(),r=t.div`
  background-color: #f0f0f0;
  padding: 16px;
  overscroll-behavior: none;

  &:focus,
  &:focus-visible {
    background-color: #bf4f74;
    color: white;
    &[data-highlighted="true"] {
      background-color: #2e86c1;
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
`;function a(){return(0,n.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:16,padding:16},children:[(0,n.jsx)(r,{tabIndex:0,children:`Menu (focus me)`}),(0,n.jsx)(r,{tabIndex:0,"data-highlighted":`true`,children:`Menu (highlighted on focus)`}),(0,n.jsx)(i,{tabIndex:0,children:`Interactive Box`}),(0,n.jsx)(i,{tabIndex:0,"data-muted":`true`,children:`Interactive Box (muted)`}),(0,n.jsx)(i,{tabIndex:0,"data-no-outline":`true`,children:`Interactive Box (no outline)`})]})}export{a as App};