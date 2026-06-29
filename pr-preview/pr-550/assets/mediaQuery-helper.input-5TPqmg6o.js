import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{u as t}from"./index-BrCQKIJn.js";import{S as n,x as r}from"./helpers-s8kspoFP.js";var i=e(),a=t.div`
  width: 100%;
  padding: 1rem;

  /* Standard @media rule */
  @media (min-width: 1024px) {
    padding: 2rem;
  }

  /* Selector-interpolated media query helper */
  ${r.phone} {
    padding: 0.5rem;
  }
`,o=t.div`
  padding: 0 24px;
  padding-bottom: 12px;

  ${r.phone} {
    padding: 0 16px;
  }
`,s=t.div`
  padding: 8px;

  @media (min-width: ${n.phone}px) {
    padding: 16px;
  }

  @media (max-width: ${n.phone}px) {
    margin: 4px;
  }
`,c=()=>(0,i.jsxs)(`div`,{children:[(0,i.jsx)(a,{children:`Responsive container`}),(0,i.jsx)(o,{children:`Details column`}),(0,i.jsx)(s,{children:`Breakpoint value details`})]});export{c as App};