import{j as e,s as n,c as s}from"./index-aW725Arn.js";import{B as x}from"./helpers-49X0Qmv6.js";const t=s.div`
  display: inline-flex;
  justify-content: center;
  align-items: center;
  flex-shrink: 0;
  word-break: keep-all;
  width: ${i=>i.$size}px;
  height: auto;
  max-width: ${i=>i.$size}px;
  max-height: ${i=>i.$size}px;

  ${i=>x.isSafari?n`
        font-size: ${i.$size-4}px;
        line-height: 1;

        @media (-webkit-min-device-pixel-ratio: 2), (min-resolution: 192dpi) {
          font-size: ${i.$size-3}px;
          line-height: ${i.$size-1}px;
        }
      `:n`
      font-size: ${i.$size-3}px;
      line-height: ${i.$size}px;

      @media (-webkit-min-device-pixel-ratio: 2), (min-resolution: 192dpi) {
        font-size: ${i.$size-1}px;
        line-height: ${i.$size}px;
      }
    `}
`,r=()=>e.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:8,padding:16},children:[e.jsx(t,{$size:16,children:"🎉"}),e.jsx(t,{$size:24,children:"🚀"}),e.jsx(t,{$size:32,children:"✨"})]});export{r as App,t as EmojiContainer};
