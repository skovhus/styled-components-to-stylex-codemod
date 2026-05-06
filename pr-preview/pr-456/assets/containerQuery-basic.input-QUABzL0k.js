import{c as e,p as t}from"./index-FoycHDhT.js";import{c as n}from"./helpers-BdhSDfhh.js";var r=t(),i=e.div`
  display: none;

  @container sidebar (min-width: 300px) {
    display: flex;
  }
`,a=e.div`
  display: flex;
  flex-wrap: nowrap;
  gap: 8px;

  @container sidebar (max-width: 240px) {
    flex-wrap: wrap;
  }
`,o=e.div`
  display: flex;
  ${n()}
  flex-wrap: nowrap;
  gap: 8px;

  @container sidebar (max-width: 240px) {
    flex-wrap: wrap;
  }
`,s=e.div`
  container-name: sidebar;
  container-type: inline-size;
  width: 100%;
  border: 1px solid #ccc;
  padding: 16px;
`,c=()=>(0,r.jsxs)(s,{children:[(0,r.jsx)(i,{children:`Visible when container > 300px`}),(0,r.jsxs)(a,{children:[(0,r.jsx)(`span`,{children:`Container`}),(0,r.jsx)(`span`,{children:`wraps`})]}),(0,r.jsxs)(o,{children:[(0,r.jsx)(`span`,{children:`Helper`}),(0,r.jsx)(`span`,{children:`wraps`})]})]});export{c as App};