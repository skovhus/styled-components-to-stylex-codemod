import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{u as t}from"./index-Bls4nrjI.js";var n=e(),r=t.button`
  display: flex;
  color: #bf4f74;
  font-size: 1em;
  margin: 1em;
  padding: 0.25em 1em;
  border: 2px solid #bf4f74;
  border-radius: 3px;
`,i=t(r)`
  color: tomato;
  border-color: tomato;

  @media print {
    display: block;
  }
`,a=t.div`
  color: ${e=>e.$tint};
  padding: 4px;
  background-color: #f0f0f0;
`,o=t(a)`
  padding: 16px;
`,s=()=>(0,n.jsxs)(`div`,{children:[(0,n.jsx)(r,{children:`Normal Button`}),(0,n.jsx)(i,{children:`Tomato Button`}),(0,n.jsx)(a,{$tint:`crimson`,children:`Tinted (4px padding)`}),(0,n.jsx)(o,{$tint:`seagreen`,children:`Big tinted (16px padding)`})]});export{s as App};