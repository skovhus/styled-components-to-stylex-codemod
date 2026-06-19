import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{u as t}from"./index-Bls4nrjI.js";import{c as n}from"./helpers-Cg7CpjAv.js";var r=e(),i=t.div`
  display: none;

  @container sidebar (min-width: 300px) {
    display: flex;
  }
`,a=t.div`
  display: flex;
  flex-wrap: nowrap;
  gap: 8px;

  @container sidebar (max-width: 240px) {
    flex-wrap: wrap;
  }
`,o=t.div`
  display: flex;
  ${n()}
  flex-wrap: nowrap;
  gap: 8px;

  @container sidebar (max-width: 240px) {
    flex-wrap: wrap;
  }
`,s=t.div`
  container-name: sidebar;
  container-type: inline-size;
  width: 100%;
  border: 1px solid #ccc;
  padding: 16px;
`,c=()=>(0,r.jsxs)(s,{children:[(0,r.jsx)(i,{children:`Visible when container > 300px`}),(0,r.jsxs)(a,{children:[(0,r.jsx)(`span`,{children:`Container`}),(0,r.jsx)(`span`,{children:`wraps`})]}),(0,r.jsxs)(o,{children:[(0,r.jsx)(`span`,{children:`Helper`}),(0,r.jsx)(`span`,{children:`wraps`})]})]});export{c as App};