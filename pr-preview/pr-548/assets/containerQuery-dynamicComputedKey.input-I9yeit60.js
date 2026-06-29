import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{u as t}from"./index-BCxlhZuN.js";import{S as n}from"./helpers-CO4pviTs.js";var r=e(),i=t.div`
  width: ${e=>e.$wide?`100%`:`calc(100% - 120px)`};
  background-color: #e0f2fe;
  padding: 16px;

  @container panel (max-width: ${n.phone}px) {
    width: ${e=>e.$wide?`100%`:`calc(100% - 40px)`};
  }

  @media print {
    width: auto;
  }
`,a=()=>(0,r.jsxs)(`div`,{style:{containerType:`inline-size`,display:`flex`,gap:`8px`},children:[(0,r.jsx)(i,{children:`Default`}),(0,r.jsx)(i,{$wide:!0,children:`Wide`})]});export{a as App,i as Panel};