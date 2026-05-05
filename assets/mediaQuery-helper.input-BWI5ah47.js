import{c as e,p as t}from"./index-B6JtOkYd.js";import{v as n}from"./helpers-DA0XGB9F.js";var r=t(),i=e.div`
  width: 100%;
  padding: 1rem;

  /* Standard @media rule */
  @media (min-width: 1024px) {
    padding: 2rem;
  }

  /* Selector-interpolated media query helper */
  ${n.phone} {
    padding: 0.5rem;
  }
`,a=e.div`
  padding: 0 24px;
  padding-bottom: 12px;

  ${n.phone} {
    padding: 0 16px;
  }
`,o=()=>(0,r.jsxs)(`div`,{children:[(0,r.jsx)(i,{children:`Responsive container`}),(0,r.jsx)(a,{children:`Details column`})]});export{o as App};