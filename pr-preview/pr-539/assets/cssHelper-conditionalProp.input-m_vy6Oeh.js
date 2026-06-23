import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{l as t,u as n}from"./index-DwY7QZNR.js";import{D as r,a as i}from"./helpers-UzVosowW.js";var a=e();function o(e){let{gap:t,className:n,style:r,children:i}=e;return(0,a.jsx)(`div`,{className:n,style:{display:`flex`,gap:t,...r},children:i})}var s=n(o)`
  ${e=>e.$color&&t`
      background-color: ${e.$color};
    `}
  padding: 2px 6px;
  border-radius: 3px;
`,c=n(o)`
  ${e=>e.$active&&t`
      cursor: pointer;
      opacity: ${e.$opacity};
    `}
  padding: 2px 6px;
  border-radius: 3px;
`,l=n(o)`
  ${e=>e.$active&&t`
      color: ${e.$color};
    `}
  padding: 2px 6px;
  border-radius: 3px;
`,u=n(o)`
  ${e=>e.$active?t`
          color: ${e.$color};
        `:void 0}
  padding: 2px 6px;
  border-radius: 3px;
`,d=n(o)`
  ${e=>e.$active?void 0:t`
          color: ${e.$color};
        `}
  padding: 2px 6px;
  border-radius: 3px;
`,f=n(o)`
  ${e=>e.$isHighlighted?t`
          box-shadow: inset 0 0 0 ${r()} ${i(`controlPrimary`)};
        `:null}
  padding: 2px 6px;
  border-radius: 3px;
`,p=()=>(0,a.jsxs)(a.Fragment,{children:[(0,a.jsx)(s,{gap:4,$color:`rebeccapurple`,children:`Hello`}),(0,a.jsx)(c,{gap:4,$active:!0,$opacity:.75,children:`Mixed`}),(0,a.jsx)(l,{gap:4,$active:!0,$color:`crimson`,children:`Pure dynamic`}),(0,a.jsx)(u,{gap:4,$active:!0,$color:`darkgreen`,children:`Ternary pure dynamic`}),(0,a.jsx)(d,{gap:4,$color:`darkblue`,children:`Inverted ternary pure dynamic`}),(0,a.jsx)(f,{gap:4,$isHighlighted:!0,children:`Highlighted shadow`})]});export{p as App,s as Container,f as HighlightedShadowContainer,d as InvertedTernaryPureDynamicContainer,c as MixedContainer,l as PureDynamicContainer,u as TernaryPureDynamicContainer};