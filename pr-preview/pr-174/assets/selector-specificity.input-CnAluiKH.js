import{j as e,a as i}from"./index-CikS5bYh.js";const r=i.div`
  /* Single ampersand has normal specificity */
  && {
    /* Double ampersand increases specificity */
    color: red;
  }

  &&& {
    /* Triple ampersand for even higher specificity */
    color: blue;
  }
`,s=i.div`
  .wrapper && {
    /* Context-based specificity boost */
    background: papayawhip;
  }
`,p=()=>e.jsxs("div",{className:"wrapper",children:[e.jsx(r,{children:"High specificity text (blue due to &&&)"}),e.jsx(s,{children:"Context override (papayawhip background)"})]});export{p as App};
