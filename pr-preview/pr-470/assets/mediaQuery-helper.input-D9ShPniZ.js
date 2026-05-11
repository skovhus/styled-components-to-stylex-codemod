import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{c as t}from"./index-3q1_u1Km.js";import{b as n,x as r}from"./helpers-KJMhDkdU.js";var i=e(),a=t.div`
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
`,o=t.div`
  padding: 0 24px;
  padding-bottom: 12px;

  ${n.phone} {
    padding: 0 16px;
  }
`,s=t.div`
  padding: 8px;

  @media (min-width: ${r.phone}px) {
    padding: 16px;
  }

  @media (max-width: ${r.phone}px) {
    margin: 4px;
  }
`,c=()=>(0,i.jsxs)(`div`,{children:[(0,i.jsx)(a,{children:`Responsive container`}),(0,i.jsx)(o,{children:`Details column`}),(0,i.jsx)(s,{children:`Breakpoint value details`})]});export{c as App};