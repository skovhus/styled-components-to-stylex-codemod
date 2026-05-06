import{c as e,p as t}from"./index-DDr0B6mK.js";import{v as n,y as r}from"./helpers-CS4F7Gqp.js";var i=t(),a=e.div`
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
`,o=e.div`
  padding: 0 24px;
  padding-bottom: 12px;

  ${n.phone} {
    padding: 0 16px;
  }
`,s=e.div`
  padding: 8px;

  @media (min-width: ${r.phone}px) {
    padding: 16px;
  }

  @media (max-width: ${r.phone}px) {
    margin: 4px;
  }
`,c=()=>(0,i.jsxs)(`div`,{children:[(0,i.jsx)(a,{children:`Responsive container`}),(0,i.jsx)(o,{children:`Details column`}),(0,i.jsx)(s,{children:`Breakpoint value details`})]});export{c as App};