import { describe, expect, it } from 'vitest';
import { linkifyTimestamps } from './timestampLinks';

describe('linkifyTimestamps', () => {
  it('converts single timestamp to #video-seek link', () => {
    const input = '在 01:05 处可以看到宫颈口。';
    const output = linkifyTimestamps(input);
    expect(output).toBe('在 [01:05](#video-seek?start=65) 处可以看到宫颈口。');
  });

  it('strips surrounding square brackets and parentheses without producing double brackets', () => {
    const input = '在 [00:15] 处可以看到，在 (01:20-01:30) 之间结束。';
    const output = linkifyTimestamps(input);
    expect(output).toBe(
      '在 [00:15](#video-seek?start=15) 处可以看到，在 [01:20-01:30](#video-seek?start=80&end=90) 之间结束。',
    );
  });

  it('converts timestamp range with hyphen to #video-seek link', () => {
    const input = '例如 00:02-00:04 及 00:46-01:07，宫颈口位于中央。';
    const output = linkifyTimestamps(input);
    expect(output).toBe(
      '例如 [00:02-00:04](#video-seek?start=2&end=4) 及 [00:46-01:07](#video-seek?start=46&end=67)，宫颈口位于中央。',
    );
  });

  it('handles en-dash, em-dash, and tilde separators', () => {
    const input = '片段 00:10~00:20 和 01:00–01:30。';
    const output = linkifyTimestamps(input);
    expect(output).toBe(
      '片段 [00:10~00:20](#video-seek?start=10&end=20) 和 [01:00–01:30](#video-seek?start=60&end=90)。',
    );
  });

  it('does not touch timestamps inside existing markdown links', () => {
    const input = '请查看 [00:10 关键片段](https://example.com) 以及 00:20 处。';
    const output = linkifyTimestamps(input);
    expect(output).toBe('请查看 [00:10 关键片段](https://example.com) 以及 [00:20](#video-seek?start=20) 处。');
  });

  it('does not touch timestamps inside code blocks or inline code', () => {
    const input = '代码 `const time = "00:30";` 中有时间，但文本中的 00:45 应该被转换。';
    const output = linkifyTimestamps(input);
    expect(output).toBe('代码 `const time = "00:30";` 中有时间，但文本中的 [00:45](#video-seek?start=45) 应该被转换。');
  });

  it('ignores dates like 2026-09-04', () => {
    const input = '今天是 2026-09-04 日期。';
    const output = linkifyTimestamps(input);
    expect(output).toBe('今天是 2026-09-04 日期。');
  });

  it('handles hour timestamps hh:mm:ss', () => {
    const input = '在 1:02:03-1:03:00 之间。';
    const output = linkifyTimestamps(input);
    expect(output).toBe('在 [1:02:03-1:03:00](#video-seek?start=3723&end=3780) 之间。');
  });

  it('converts inline <video-locate> tags into interactive seek links', () => {
    const input = '- 阴蒂与包皮 <video-locate start="00:05" point="200,500">00:05</video-locate>：位于最上方。';
    const output = linkifyTimestamps(input);
    expect(output).toContain('[00:05](#video-seek?start=5&point=200%2C500&snippet=00%3A05)');
    expect(output).not.toContain('<video-locate');
  });

  it('converts inline <video-locate> tags with text descriptions', () => {
    const input = '- 结构展示：<video-locate start="00:15" point="350,520">阴蒂与阴蒂包皮</video-locate>';
    const output = linkifyTimestamps(input);
    expect(output).toContain(
      '[00:15 · 阴蒂与阴蒂包皮](#video-seek?start=15&point=350%2C520&snippet=%E9%98%B4%E8%92%82%E4%B8%8E%E9%98%B4%E8%92%82%E5%8C%85%E7%9A%AE)',
    );
  });

  it('omits trailing <video-locate> tags when matching timestamps already exist in body', () => {
    const input = [
      '- 阴蒂包皮（00:05）：位于上方。',
      '- 尿道外口（00:15）：位于下方。',
      '',
      '<video-locate start="00:05" point="200,500">阴蒂包皮</video-locate>',
      '<video-locate start="00:15" point="300,500">尿道外口</video-locate>',
    ].join('\n');
    const output = linkifyTimestamps(input);
    // Body timestamps should be linkified
    expect(output).toContain('[00:05](#video-seek?start=5)');
    expect(output).toContain('[00:15](#video-seek?start=15)');
    // Trailing duplicate tags should NOT produce duplicate bottom buttons
    expect(output).not.toContain('阴蒂包皮](#video-seek');
  });

  it('renders trailing <video-locate> tags when no timestamps exist in body', () => {
    const input = [
      '- 阴蒂包皮：位于上方。',
      '- 尿道外口：位于下方。',
      '',
      '<video-locate start="00:05" point="200,500">阴蒂包皮</video-locate>',
      '<video-locate start="00:15" point="300,500">尿道外口</video-locate>',
    ].join('\n');
    const output = linkifyTimestamps(input);
    expect(output).toContain(
      '[00:05 · 阴蒂包皮](#video-seek?start=5&point=200%2C500&snippet=%E9%98%B4%E8%92%82%E5%8C%85%E7%9A%AE)',
    );
    expect(output).toContain(
      '[00:15 · 尿道外口](#video-seek?start=15&point=300%2C500&snippet=%E5%B0%BF%E9%81%93%E5%A4%96%E5%8F%A3)',
    );
  });

  it('strips partial video-locate tags at the end of streaming content', () => {
    const input = '正在输出中 <video-locate start="00:10" point="100,200';
    const output = linkifyTimestamps(input);
    expect(output).toBe('正在输出中 ');
  });

  it('omits redundant video-locate tag on the next line when preceding bullet contains matching timestamp', () => {
    const input = [
      '• 在 00:02，手指触碰宫颈外口时，外口左边缘附着有一小圈乳白色、黏稠的宫颈黏液：',
      '  <video-locate start="00:02" point="450,550">宫颈外口边缘的乳白色黏液</video-locate>',
      '• 在 00:54 - 00:56，手指离开宫颈口时，宫颈管口可见拉丝状、微白半透明的黏液分泌物：',
      '  <video-locate start="00:55" point="500,520">宫颈管口微白半透明黏液</video-locate>',
    ].join('\n');
    const output = linkifyTimestamps(input);

    // In-sentence timestamps should be converted to inline buttons
    expect(output).toContain('• 在 [00:02](#video-seek?start=2)，手指触碰宫颈外口时');
    expect(output).toContain('• 在 [00:54 - 00:56](#video-seek?start=54&end=56)，手指离开宫颈口时');

    // Redundant second-line locate buttons should NOT appear
    expect(output).not.toContain('宫颈外口边缘的乳白色黏液');
    expect(output).not.toContain('宫颈管口微白半透明黏液');
  });

  it('retains video-locate tag when preceding bullet contains NO timestamp', () => {
    const input = [
      '• 阴蒂与阴蒂包皮：位于外阴最上方联合处。',
      '  <video-locate start="00:05" point="200,500">阴蒂与阴蒂包皮</video-locate>',
    ].join('\n');
    const output = linkifyTimestamps(input);

    expect(output).toContain('• 阴蒂与阴蒂包皮：位于外阴最上方联合处。');
    expect(output).toContain(
      '[00:05 · 阴蒂与阴蒂包皮](#video-seek?start=5&point=200%2C500&snippet=%E9%98%B4%E8%92%82%E4%B8%8E%E9%98%B4%E8%92%82%E5%8C%85%E7%9A%AE)',
    );
  });

  it('omits video-locate tag on the next line when preceding text already contains the same timestamp', () => {
    const input = [
      '3. 互动与反应 [00:46] : 佩戴过程中 Coser 因不适和敏感多次呼痛、求轻点并伴随笑闹，现场人员亦提醒注意隐私并关闭房门 [00:37]。',
      '   <video-locate start="00:46">佩戴过程中的互动与反应</video-locate>',
    ].join('\n');
    const output = linkifyTimestamps(input);

    expect(output).toContain('[00:46](#video-seek?start=46)');
    expect(output).toContain('[00:37](#video-seek?start=37)');
    expect(output).not.toContain('佩戴过程中的互动与反应');
  });

  it('converts inline <audio-locate> tags with snippet and audio attribute', () => {
    const input =
      '访谈中提到了 <audio-locate audio="interview.mp3" start="01:23" end="02:00">商业模式转变</audio-locate>，随后进入提问环节。';
    const output = linkifyTimestamps(input);
    expect(output).toContain(
      '[01:23-02:00 · 商业模式转变](#video-seek?start=83&end=120&video=interview.mp3&snippet=%E5%95%86%E4%B8%9A%E6%A8%A1%E5%BC%8F%E8%BD%AC%E5%8F%98)',
    );
    expect(output).not.toContain('<audio-locate');
  });

  it('converts trailing <audio-locate> tags into interactive links', () => {
    const input = [
      '录音重点记录如下：',
      '',
      '<audio-locate audio="interview.mp3" start="05:10">结尾总结</audio-locate>',
    ].join('\n');
    const output = linkifyTimestamps(input);
    expect(output).toContain(
      '[05:10 · 结尾总结](#video-seek?start=310&video=interview.mp3&snippet=%E7%BB%93%E5%B0%BE%E6%80%BB%E7%BB%93)',
    );
  });

  it('handles self-closing <video-locate /> tags', () => {
    const input = '关键动作在 <video-locate start="00:45" point="100,200" /> 处。';
    const output = linkifyTimestamps(input);
    expect(output).not.toContain('<video-locate');
    expect(output).toContain('[00:45](#video-seek?start=45&point=100%2C200)');
  });

  it('escapes square brackets inside video-locate snippet', () => {
    const input = '<video-locate start="01:00">片段 [核心看点]</video-locate>';
    const output = linkifyTimestamps(input);
    expect(output).toContain('[01:00 · 片段 \\[核心看点\\]](#video-seek?start=60');
  });
});
