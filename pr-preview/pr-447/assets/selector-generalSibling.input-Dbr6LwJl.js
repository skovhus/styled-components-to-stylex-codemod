import{c as e,p as t}from"./index-DIKafusi.js";var n=t(),r=e.div`
  color: blue;
  padding: 8px 16px;

  /* General sibling selector */
  & ~ & {
    border-bottom: 2px solid gray;
  }
`,i=()=>(0,n.jsxs)(`div`,{style:{padding:16},children:[(0,n.jsx)(r,{children:`First`}),(0,n.jsx)(r,{children:`Second (border-bottom in CSS)`}),(0,n.jsx)(r,{children:`Third (border-bottom in CSS)`})]});export{i as App};