import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{l as t,u as n}from"./index-CDstLmN7.js";import{t as r}from"./helpers-AE5Qe1p4.js";var i=e(),a=n.div`
  display: inline-flex;
  justify-content: center;
  align-items: center;
  flex-shrink: 0;
  word-break: keep-all;
  width: ${e=>e.$size}px;
  height: auto;
  max-width: ${e=>e.$size}px;
  max-height: ${e=>e.$size}px;

  ${e=>r.isSafari?t`
        font-size: ${e.$size-4}px;
        line-height: 1;

        @media (-webkit-min-device-pixel-ratio: 2), (min-resolution: 192dpi) {
          font-size: ${e.$size-3}px;
          line-height: ${e.$size-1}px;
        }
      `:t`
      font-size: ${e.$size-3}px;
      line-height: ${e.$size}px;

      @media (-webkit-min-device-pixel-ratio: 2), (min-resolution: 192dpi) {
        font-size: ${e.$size-1}px;
        line-height: ${e.$size}px;
      }
    `}
`,o=()=>(0,i.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:8,padding:16},children:[(0,i.jsx)(a,{$size:16,children:`🎉`}),(0,i.jsx)(a,{$size:24,children:`🚀`}),(0,i.jsx)(a,{$size:32,children:`✨`})]});export{o as App,a as EmojiContainer};