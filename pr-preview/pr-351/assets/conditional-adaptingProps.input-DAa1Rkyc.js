import"./react-D4cBbUL-.js";import{f as e,s as t}from"./index-CvfJmPeC.js";var n=e(),r=t.button`
  color: ${e=>e.$primary?`white`:`#BF4F74`};
  font-size: 1em;
  margin: 1em;
  padding: 0.25em 1em;
  border-radius: 3px;
  ${e=>e.hollow?`border: 2px solid #bf4f74`:`background: ${e.$primary?`#BF4F74`:`white`}`};
`,i=t.span`
  display: inline-block;
  ${e=>e.size===`small`?`font-size: 10px`:`background: ${e.size===`large`?`blue`:`gray`}`};
`,a=()=>(0,n.jsxs)(`div`,{children:[(0,n.jsx)(r,{children:`Normal`}),(0,n.jsx)(r,{$primary:!0,children:`Primary`}),(0,n.jsx)(`br`,{}),(0,n.jsx)(r,{hollow:!0,children:`Hollow`}),(0,n.jsx)(r,{hollow:!0,$primary:!0,children:`Primary Hollow`}),(0,n.jsx)(`br`,{}),(0,n.jsx)(i,{size:`small`,children:`Small`}),(0,n.jsx)(i,{size:`medium`,children:`Medium`}),(0,n.jsx)(i,{size:`large`,children:`Large`})]});export{a as App};