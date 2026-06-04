import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{c as t,l as n}from"./index-NN6dT_9q.js";var r=e();function i(e){let{gap:t,className:n,style:i,children:a}=e;return(0,r.jsx)(`div`,{className:n,style:{display:`flex`,gap:t,...i},children:a})}var a=n(i)`
  ${e=>e.$color&&t`
      background-color: ${e.$color};
    `}
  padding: 2px 6px;
  border-radius: 3px;
`,o=n(i)`
  ${e=>e.$active&&t`
      cursor: pointer;
      opacity: ${e.$opacity};
    `}
  padding: 2px 6px;
  border-radius: 3px;
`,s=n(i)`
  ${e=>e.$active&&t`
      color: ${e.$color};
    `}
  padding: 2px 6px;
  border-radius: 3px;
`,c=n(i)`
  ${e=>e.$active?t`
          color: ${e.$color};
        `:void 0}
  padding: 2px 6px;
  border-radius: 3px;
`,l=n(i)`
  ${e=>e.$active?void 0:t`
          color: ${e.$color};
        `}
  padding: 2px 6px;
  border-radius: 3px;
`,u=()=>(0,r.jsxs)(r.Fragment,{children:[(0,r.jsx)(a,{gap:4,$color:`rebeccapurple`,children:`Hello`}),(0,r.jsx)(o,{gap:4,$active:!0,$opacity:.75,children:`Mixed`}),(0,r.jsx)(s,{gap:4,$active:!0,$color:`crimson`,children:`Pure dynamic`}),(0,r.jsx)(c,{gap:4,$active:!0,$color:`darkgreen`,children:`Ternary pure dynamic`}),(0,r.jsx)(l,{gap:4,$color:`darkblue`,children:`Inverted ternary pure dynamic`})]});export{u as App,a as Container,l as InvertedTernaryPureDynamicContainer,o as MixedContainer,s as PureDynamicContainer,c as TernaryPureDynamicContainer};