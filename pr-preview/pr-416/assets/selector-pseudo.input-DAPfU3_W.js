import{f as e,s as t}from"./index-BZzx-Jen.js";var n=e(),r=t.div`
  border-right: 1px solid hotpink;
  color: blue;
  display: inline-block;
  padding: 12px;

  &:hover {
    color: red;
  }

  &:focus {
    outline: 2px solid blue;
  }

  &::before {
    content: "🔥";
  }
`,i=()=>(0,n.jsx)(r,{tabIndex:0,children:`Hover or focus me!`});export{i as App};