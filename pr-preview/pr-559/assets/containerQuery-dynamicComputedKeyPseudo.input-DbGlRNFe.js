import{t as e}from"./jsx-runtime-CF8L0Gwd.js";import{i as t}from"./styled-components.browser.esm-Dy4oaG3m.js";import{S as n}from"./helpers-daleu_Aj.js";var r=e(),i=t.div`
  color: ${e=>e.$active?`white`:`black`};
  background-color: #1e293b;
  padding: 16px;

  @container panel (max-width: ${n.phone}px) {
    color: ${e=>e.$active?`yellow`:`gray`};
  }

  &:hover {
    color: red;
  }
`,a=()=>(0,r.jsxs)(`div`,{style:{containerType:`inline-size`,display:`flex`,gap:`8px`},children:[(0,r.jsx)(i,{children:`Default`}),(0,r.jsx)(i,{$active:!0,children:`Active`})]});export{a as App,i as Box};