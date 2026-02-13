import{j as e,a as i}from"./index-D-_KpZkF.js";const s=i.div`
  /* Single ampersand has normal specificity */
  && {
    /* Double ampersand increases specificity */
    color: red;
  }

  &&& {
    /* Triple ampersand for even higher specificity */
    color: blue;
  }
`,c=()=>e.jsx("div",{children:e.jsx(s,{children:"High specificity text (blue due to &&&)"})});export{c as App};
