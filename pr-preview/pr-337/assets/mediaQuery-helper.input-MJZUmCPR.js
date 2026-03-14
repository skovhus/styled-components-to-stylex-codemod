import{j as e,c as i}from"./index-CTayzttM.js";import{s as d}from"./helpers-8UMngbnC.js";const n=i.div`
  width: 100%;
  padding: 1rem;

  /* Standard @media rule */
  @media (min-width: 1024px) {
    padding: 2rem;
  }

  /* Selector-interpolated media query helper */
  ${d.phone} {
    padding: 0.5rem;
  }
`,p=i.div`
  padding: 0 24px;
  padding-bottom: 12px;

  ${d.phone} {
    padding: 0 16px;
  }
`,a=()=>e.jsxs("div",{children:[e.jsx(n,{children:"Responsive container"}),e.jsx(p,{children:"Details column"})]});export{a as App};
