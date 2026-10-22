import{t as e}from"./jsx-runtime-CF8L0Gwd.js";import{i as t,r as n}from"./styled-components.browser.esm-Dy4oaG3m.js";import{D as r,a as i}from"./helpers-daleu_Aj.js";var a=e();function o(e){let{gap:t,className:n,style:r,children:i}=e;return(0,a.jsx)(`div`,{className:n,style:{display:`flex`,gap:t,...r},children:i})}var s=t(o)`
  ${e=>e.$color&&n`
      background-color: ${e.$color};
    `}
  padding: 2px 6px;
  border-radius: 3px;
`,c=t(o)`
  ${e=>e.$active&&n`
      cursor: pointer;
      opacity: ${e.$opacity};
    `}
  padding: 2px 6px;
  border-radius: 3px;
`,l=t(o)`
  ${e=>e.$active&&n`
      color: ${e.$color};
    `}
  padding: 2px 6px;
  border-radius: 3px;
`,u=t(o)`
  ${e=>e.$active?n`
          color: ${e.$color};
        `:void 0}
  padding: 2px 6px;
  border-radius: 3px;
`,d=t(o)`
  ${e=>e.$active?void 0:n`
          color: ${e.$color};
        `}
  padding: 2px 6px;
  border-radius: 3px;
`,f=t(o)`
  ${e=>e.$isHighlighted?n`
          box-shadow: inset 0 0 0 ${r()} ${i(`controlPrimary`)};
        `:null}
  padding: 2px 6px;
  border-radius: 3px;
`,p=()=>(0,a.jsxs)(a.Fragment,{children:[(0,a.jsx)(s,{gap:4,$color:`rebeccapurple`,children:`Hello`}),(0,a.jsx)(c,{gap:4,$active:!0,$opacity:.75,children:`Mixed`}),(0,a.jsx)(l,{gap:4,$active:!0,$color:`crimson`,children:`Pure dynamic`}),(0,a.jsx)(u,{gap:4,$active:!0,$color:`darkgreen`,children:`Ternary pure dynamic`}),(0,a.jsx)(d,{gap:4,$color:`darkblue`,children:`Inverted ternary pure dynamic`}),(0,a.jsx)(f,{gap:4,$isHighlighted:!0,children:`Highlighted shadow`})]});export{p as App,s as Container,f as HighlightedShadowContainer,d as InvertedTernaryPureDynamicContainer,c as MixedContainer,l as PureDynamicContainer,u as TernaryPureDynamicContainer};