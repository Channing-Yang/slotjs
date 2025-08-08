export function createElement(className = '', content = '', angle = null, style = null) {
    const element = document.createElement('DIV');

    element.className = Array.isArray(className) ? className.join(' ') : className;

    if (typeof content === 'string') {
        element.style.backgroundImage = `url("${ content }")`;
        element.style.backgroundRepeat = 'no-repeat';
        element.style.backgroundSize = 'cover';
        element.style.backgroundPosition = 'center';
        element.setAttribute('data-value', content);
        // element.innerText = content;
    } else if (content) {
        element.appendChild(content);
    }

    if (style) {
        element.style = style;
    }

    if (angle !== null) {
        element.style.transform = `rotate(${ angle }deg)`;
    }

    return element;
}
