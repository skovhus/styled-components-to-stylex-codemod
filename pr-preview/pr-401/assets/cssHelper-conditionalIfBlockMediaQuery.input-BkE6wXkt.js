import{c as e,f as t,u as n}from"./index-BPaLyyRP.js";import{t as r}from"./helpers-xqqmnoiX.js";var i=t(),a=n.div`
  display: inline-flex;
  justify-content: center;
  align-items: center;
  flex-shrink: 0;
  word-break: keep-all;
  width: ${e=>e.$size}px;
  height: auto;
  max-width: ${e=>e.$size}px;
  max-height: ${e=>e.$size}px;

  ${t=>r.isSafari?e`
        font-size: ${t.$size-4}px;
        line-height: 1;

        @media (-webkit-min-device-pixel-ratio: 2), (min-resolution: 192dpi) {
          font-size: ${t.$size-3}px;
          line-height: ${t.$size-1}px;
        }
      `:e`
      font-size: ${t.$size-3}px;
      line-height: ${t.$size}px;

      @media (-webkit-min-device-pixel-ratio: 2), (min-resolution: 192dpi) {
        font-size: ${t.$size-1}px;
        line-height: ${t.$size}px;
      }
    `}
`,o=()=>(0,i.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:8,padding:16},children:[(0,i.jsx)(a,{$size:16,children:`🎉`}),(0,i.jsx)(a,{$size:24,children:`🚀`}),(0,i.jsx)(a,{$size:32,children:`✨`})]});export{o as App,a as EmojiContainer};