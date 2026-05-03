import{f as e,s as t}from"./index-BZzx-Jen.js";var n=e(),r=t.div`
  display: inline-block;
  padding: 16px;
  color: blue;
  background-color: white;

  &:hover {
    color: red;
    background-color: lightblue;
  }

  &:focus-visible {
    color: green;
    outline: 2px solid blue;
  }

  @media (max-width: 600px) {
    color: orange;
    background-color: gray;
  }
`,i=()=>(0,n.jsx)(r,{tabIndex:0,children:`Hover, focus, or resize`});export{i as App};