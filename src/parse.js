// LICENSE : MIT
"use strict";

const asciidoctor = require("@asciidoctor/core")();

class Converter {
  convert(text) {
    const doc = asciidoctor.load(text, { sourcemap: true });

    // NOTE: doc.$source_lines() does not contain some whitespaces and lines...
    this.lines = text.split(/\n/);
    this.chars = [0];
    for (let line of this.lines) {
      this.chars.push(this.chars[this.chars.length - 1] + line.length + 1);
    }

    const elements = this.convertElement(doc, {
      min: 1,
      max: this.lines.length,
      update: true
    });
    if (elements.length === 0) {
      return this.createEmptyDocument();
    }
    return elements[0];
  }

  convertElement(elem, lineno) {
    if (elem.context === "document") {
      return this.convertDocument(elem, lineno);
    } else if (elem.context === "admonition") {
      return this.convertAdmonition(elem, lineno);
    } else if (["paragraph", "literal"].includes(elem.context)) {
      return this.convertParagraph(elem, lineno);
    } else if (["ulist", "olist", "colist"].includes(elem.context)) {
      return this.convertList(elem, lineno);
    } else if (elem.context === "list_item") {
      return this.convertListItem(elem, lineno);
    } else if (elem.context === "dlist") {
      return this.convertDefinitionList(elem, lineno);
    } else if (elem.context === "quote") {
      return this.convertQuote(elem, lineno);
    } else if (elem.context === "listing") {
      return this.convertListing(elem, lineno);
    } else if (elem.context === "section") {
      return this.convertSection(elem, lineno);
    } else if (elem.context === "sidebar") {
      return this.convertSidebar(elem, lineno);
    } else if (elem.context === "table") {
      return this.convertTable(elem, lineno);
    } else if (elem.context === "image") {
      return this.convertImage(elem, lineno);
    } else if (elem.context === "toc") {
      return this.convertToc(elem, lineno);
    } else if (elem.context === "preamble") {
      return this.convertElementList(elem.getBlocks(), lineno);
    } else if (["example"].includes(elem.context)) {
      return this.convertElementList(elem.$blocks(), {
        ...lineno,
        update: false
      });
    } else {
      // console.error("need to handle element: " + elem.context);
      // process.exit(1);
    }
    return [];
  }

  convertDocument(elem, lineno) {
    const raw = elem.$source();
    // const authors = this.convertAuthors(elem, lineno);

    let children = this.convertElementList(elem.$blocks(), lineno);
    if (!elem.$header()["$nil?"]()) {
      children = [this.convertHeader(elem.$header(), lineno), ...children];
    }

    let id = this.convertId(elem, lineno);
    if (id && id.raw) {
      children = [id, ...children];
    }
    // if (authors) {
    //   children = [authors, ...children];
    // }
    if (children.length === 0) {
      return [];
    }
    const loc = {
      start: children[0].loc.start,
      end: children[children.length - 1].loc.end
    };
    const range = this.locationToRange(loc);
    return [{ type: "Document", children, loc, range, raw }];
  }

  // This is nearly identical to convertSection.
  convertAdmonition(elem, lineno) {
    let children = [];
    if (elem.hasBlocks()) {
      children = this.convertElementList(elem.getBlocks(), lineno);
    } else {
      if (elem.lines[0].length < 1) {
        throw Error(
          "Found an admonition without a block and without a paragraph: ",
          lineno.min
        );
      }
      children = this.createParagraph(elem.lines.join("\n"), lineno);
    }

    if (elem.hasTitle()) {
      const title = this.getBlockTitle(elem, lineno);
      children = [title, ...children];
    }

    const obj = {
      type: "Admonition",
      style: elem.getStyle(),
      children: children,
      raw: "",
      ...this.locAndRangeFrom(children)
    };
    return obj;
  }

  convertHeader(elem, lineno) {
    const raw = elem.title;
    lineno.min = elem.getLineNumber();
    const loc = this.findLocation([raw], { ...lineno, type: "Header" });
    const range = this.locationToRange(loc);
    return {
      type: "Header",
      depth: elem.$level() + 1,
      children: [{ type: "Str", value: elem.title, loc, range, raw }],
      loc,
      range,
      raw
    };
  }

  convertSection(elem, lineno) {
    let children = [];

    const raw = elem.title;
    const loc = this.findLocation([raw], { ...lineno, type: "Header" });
    if (!loc) {
      return [];
    }
    const range = this.locationToRange(loc);
    const header = {
      type: "Header",
      depth: elem.$level() + 1,
      children: [{ type: "Str", value: elem.title, loc, range, raw }],
      loc,
      range,
      raw
    };

    let id = this.convertId(elem, lineno);
    if (id && id.raw) {
      children = [id];
    }
    children = [
      ...children,
      header,
      ...this.convertElementList(elem.$blocks(), lineno)
    ];
    return children;
  }

  convertParagraph(elem, lineno) {
    let children = [];

    const raw = elem.$source();
    const loc = this.findLocation(elem.$lines(), {
      ...lineno,
      type: "Paragraph"
    });
    if (!loc) {
      return [];
    }
    const range = this.locationToRange(loc);

    const title = this.getBlockTitle(elem, lineno);
    if ("type" in title) {
      children = [title];
    }

    children = [...children, { type: "Str", value: raw, loc, range, raw }];

    const obj = {
      type: "Paragraph",
      children: children,
      raw,
      ...this.locAndRangeFrom(children)
    };
    return obj;
  }

  convertQuote(elem, lineno) {
    const raw = ""; // TODO: fix asciidoc/asciidoc
    const children = this.convertElementList(elem.$blocks(), {
      ...lineno,
      update: false
    });
    if (children.length === 0) {
      return [];
    }
    return [
      { type: "BlockQuote", children, raw, ...this.locAndRangeFrom(children) }
    ];
  }

  convertListing(elem, lineno) {
    let children = [];

    const raw = elem.$source();
    const loc = this.findLocation(elem.$lines(), {
      ...lineno,
      type: "CodeBlock"
    });
    if (!loc) {
      return [];
    }
    const range = this.locationToRange(loc);
    const attributes =
      typeof elem.getAttributes === "function" ? elem.getAttributes() : {};

    const title = this.getBlockTitle(elem, lineno);
    if ("type" in title) {
      children = [title];
    }

    return [
      {
        type: "CodeBlock",
        lang: attributes.language,
        children: children,
        value: raw,
        loc,
        range,
        raw
      }
    ];
  }

  convertList(elem, lineno) {
    const raw = ""; // TODO: fix asciidoc/asciidoc
    const children = this.convertElementList(elem.getBlocks(), {
      ...lineno,
      update: false
    });
    if (children.length === 0) {
      return [];
    }

    if (elem.hasTitle()) {
      const title = this.getBlockTitle(elem, lineno);
      children.unshift(title);
    }

    return [{ type: "List", children, raw, ...this.locAndRangeFrom(children) }];
  }

  convertDefinitionList(elem, lineno) {
    const raw = ""; // TODO: fix asciidoc/asciidoc
    const concat = Array.prototype.concat;
    const blocks = concat.apply(
      [],
      elem.$blocks().map(([terms, item]) => [...terms, item])
    );
    const children = this.convertElementList(blocks, {
      ...lineno,
      update: false
    });
    if (children.length === 0) {
      return [];
    }
    return [{ type: "List", children, raw, ...this.locAndRangeFrom(children) }];
  }

  convertListItem(elem, lineno) {
    const raw = ""; // TODO: fix asciidoc/asciidoc
    let children = this.convertElementList(elem.$blocks(), lineno);
    if (!elem.text["$nil?"]()) {
      children = [...this.createParagraph(elem.text, lineno), ...children];
    }
    if (children.length === 0) {
      return [];
    }
    return [
      {
        type: "ListItem",
        children,
        raw,
        ...this.locAndRangeFrom(children)
      }
    ];
  }

  convertTableCell(elem, lineno) {
    const raw = elem.text;
    const loc = this.findLocation(raw.split(/\n/), {
      ...lineno,
      type: "TableCell"
    });
    if (!loc) {
      return [];
    }
    const range = this.locationToRange(loc);

    let children = [];
    if (elem.style === "asciidoc") {
      children = this.convertElementList(
        elem.$inner_document().$blocks(),
        lineno
      );
    } else {
      children = [
        {
          type: "Str",
          value: raw,
          loc,
          range,
          raw
        }
      ];
    }

    return [
      {
        type: "TableCell",
        children,
        loc,
        range,
        raw
      }
    ];
  }

  convertTableRow(row, lineno) {
    let children = [];
    for (let cell of row) {
      // If the cell has a preceding sibling and the sibling is on the same
      // line number, add an offset to the lineno variable so that
      // findLocation() begins its search from the end of the preceding sibling.
      lineno.min = cell.getLineNumber();
      if (children.length > 0) {
        const sibling = children[children.length - 1];
        if (sibling.loc.end.line === lineno.min) {
          lineno.startIdx = sibling.loc.end.column;
        } else {
          lineno.startIdx = 0; // Else, search from the beginning of the line.
        }
      }
      children = [...children, ...this.convertTableCell(cell, lineno)];
    }
    if (children.length === 0) {
      return [];
    }
    const loc = {
      start: children[0].loc.start,
      end: children[children.length - 1].loc.end
    };
    const range = this.locationToRange(loc);
    return [
      {
        type: "TableRow",
        children,
        loc,
        range,
        raw: ""
      }
    ];
  }

  convertTable(elem, lineno) {
    let children = [];

    const attrs = this.getTableAttributes(elem, lineno);
    if ("type" in attrs) {
      //children.push(attrs[0]); // FIXME: Return the correct type.
      children = [attrs, ...children];
    }

    const title = this.getBlockTitle(elem, lineno);
    if ("type" in title) {
      children = [title, ...children];
    }

    // Check for a header option.
    for (let row of elem.getHeadRows()) {
      lineno.min = row[0].getLineNumber();
      children = [
        ...children,
        ...this.convertTableRow(row, { ...lineno, update: false })
      ];
    }

    for (let row of elem.getBodyRows()) {
      // Set the minimum line number to the line number of
      // the first cell.  Making this change prevents the
      // findLocation() function from locating text in this
      // row as a substring of a preceding row.
      lineno.min = row[0].getLineNumber();
      children = [
        ...children,
        ...this.convertTableRow(row, { ...lineno, update: false })
      ];
    }

    if (children.length === 0) {
      return [];
    }

    const loc = {
      start: children[0].loc.start,
      end: children[children.length - 1].loc.end
    };

    const range = this.locationToRange(loc);

    return [
      {
        type: "Table",
        children,
        loc,
        range,
        raw: ""
      }
    ];
  }

  createParagraph(raw, lineno) {
    const loc = this.findLocation(raw.split(/\n/), {
      ...lineno,
      type: "Paragraph"
    });
    if (!loc) {
      return [];
    }
    const range = this.locationToRange(loc);
    return [
      {
        type: "Paragraph",
        children: [{ type: "Str", value: raw, loc, range, raw }],
        loc,
        range,
        raw
      }
    ];
  }

  locAndRangeFrom(children) {
    const loc = {
      start: children[0].loc.start,
      end: children[children.length - 1].loc.end
    };
    const range = this.locationToRange(loc);
    return { loc, range };
  }

  positionToIndex({ line, column }) {
    return this.chars[line - 1] + column;
  }

  locationToRange({ start, end }) {
    return [this.positionToIndex(start), this.positionToIndex(end)];
  }

  convertElementList(elements, { min, max, update }) {
    let children = [];
    for (let i = 0; i < elements.length; i++) {
      let next = { min, max, update };
      // Not updating definitely causes trouble.
      // I can't find a case in which updating causes trouble.
      //  if (update) {
      next.min = elements[i].$lineno();
      if (i + 1 < elements.length) {
        next.max = elements[i + 1].$lineno();
      }
      // }
      children = children.concat(this.convertElement(elements[i], next));
    }
    return children;
  }

  findLocation(lines, { min, max, type, startIdx }) {
    for (let i = min; i + lines.length - 1 <= max; i++) {
      let found = true;
      let offset = 0; // see "comment in paragraph" test case.
      startIdx = startIdx || 0; // index into the line to begin the search
      for (let j = 0; j < lines.length; j++) {
        while (
          type !== "CodeBlock" &&
          this.lines[i + j - 1 + offset].match(/^\/\//)
        ) {
          offset++;
        }
        if (this.lines[i + j - 1 + offset].indexOf(lines[j], startIdx) === -1) {
          found = false;
          break;
        }
      }
      if (!found) {
        continue;
      }

      const lastLine = lines[lines.length - 1];
      const endLineNo = i + lines.length - 1 + offset;
      const endColumn =
        this.lines[endLineNo - 1].indexOf(lastLine) + lastLine.length;
      const column = this.lines[i - 1].indexOf(lines[0]);
      return {
        // If the lines starts with //, set 0 instead of -1
        start: { line: i, column: column === -1 ? 0 : column },
        end: { line: endLineNo, column: endColumn }
      };
    }
    return null;
  }

  // Find the location by starting from the original lineno.min
  // and iteratively search at lineno.min - 1.
  findLocationBackward(lines, { min, max, type, startIdx }, count) {
    const origMin = min;
    for (let i = min - 1; i > 0 && i > origMin - count; i--) {
      const location = this.findLocation(lines, {
        min: i,
        max: origMin,
        type,
        startIdx
      });
      if (location !== null) {
        return location;
      }
    }
    return null;
  }

  createEmptyDocument() {
    return {
      type: "Document",
      children: [],
      range: [0, 0],
      loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
      raw: ""
    };
  }

  /**
   * Returns the cols and options table attributes.
   * If tablepcwidth is not 100, then it is returned too.
   * @param {*} node
   * @param lineno -- this is the position of the table
   */
  getTableAttributes(node, lineno) {
    const attributes =
      typeof node.getAttributes === "function" ? node.getAttributes() : {};
    if (typeof attributes !== "object") {
      return [];
    }

    for (const key in attributes) {
      if (
        [
          "attribute_entries",
          "colcount",
          "rowcount",
          "style",
          "tablepcwidth"
        ].includes(key) ||
        attributes[key] === ""
      ) {
        delete attributes[key];
        continue;
      }
    }

    let attrs = "";
    let count = Object.keys(attributes).length;

    for (let i = 0; i < count; ++i) {
      let key = Object.keys(attributes)[i];

      attrs += key + '="' + attributes[key] + '"';
      if (i < count - 1) {
        attrs += ",";
      }
    }
    attrs = "[" + attrs + "]";

    const loc = this.findLocation(["["], {
      min: Math.max(1, lineno.min - 2),
      max: lineno.min,
      type: "Attributes"
    });
    if (!loc) {
      return [];
    }
    loc.end.column = attrs.length;
    const range = this.locationToRange(loc);

    const obj = {
      type: "Attributes",
      children: [{ type: "Str", value: attrs, loc, range, raw: attrs }],
      loc,
      range,
      raw: attrs
    };

    return obj;
  }

  convertAuthors(elem, lineno) {
    let authors = [];

    for (let author of elem.getAuthors()) {
      console.log(author);
      let children = [];
      const name = this.convertAuthorName(author, lineno);
      if (name) {
        children.push(name);
      }
      const email = this.convertAuthorEmail(author, lineno);
      if (email) {
        children.push(email);
      }

      authors.push({
        type: "Author",
        children: [name, email],
        raw: "",
        ...this.locAndRangeFrom(children)
      });
    }
    if (0 === authors.length) {
      return {};
    }
    const obj = {
      type: "Authors",
      children: [authors],
      raw: "",
      ...this.locAndRangeFrom(authors)
    };

    return obj;
  }

  convertAuthorEmail(author, lineno) {
    const raw = author.getEmail();
    const loc = this.findLocation([raw], {
      ...lineno,
      type: "AuthorEmail"
    });
    if (!loc) {
      return {};
    }
    const range = this.locationToRange(loc);
    const obj = {
      type: "AuthorEmail",
      children: [{ type: "Str", value: raw, loc, range, raw }],
      loc,
      range,
      raw
    };
    return obj;
  }

  convertAuthorName(author, lineno) {
    const raw = author.getName();
    const loc = this.findLocation([raw], {
      ...lineno,
      type: "AuthorName"
    });
    if (!loc) {
      return {};
    }
    const range = this.locationToRange(loc);
    const obj = {
      type: "AuthorName",
      children: [{ type: "Str", value: raw, loc, range, raw }],
      loc,
      range,
      raw
    };
    return obj;
  }

  convertId(elem, lineno) {
    if (typeof elem.getId !== "function" || elem.getId() === "") {
      return {};
    }
    const raw = elem.getId();
    const loc = this.findLocationBackward(
      [raw],
      {
        ...lineno,
        type: "ID"
      },
      2 /* Look backward at most two lines. */
    );
    if (!loc) {
      return {};
    }
    const range = this.locationToRange(loc);
    const obj = {
      type: "ID",
      children: [{ type: "Str", value: raw, loc, range, raw }],
      loc,
      range,
      raw
    };
    return obj;
  }

  convertToc(elem, lineno) {
    const line = elem.getSourceLocation().lineno - 1;
    const raw = this.lines[line];
    const loc = this.findLocation([raw], {
      ...lineno,
      type: "TOC"
    });
    if (!loc) {
      return {};
    }
    const range = this.locationToRange(loc);
    const obj = {
      type: "TOC",
      children: [{ type: "Str", value: raw, loc, range, raw }],
      loc,
      range,
      raw
    };
    return obj;
  }

  // Attributes appear to be alt, imagesdir, target
  // An image can also have a title, in .Block title form.
  convertImage(elem, lineno) {
    const line = elem.getSourceLocation().lineno - 1;
    const raw = this.lines[line];
    const loc = this.findLocation([raw], {
      ...lineno,
      type: "Image"
    });
    if (!loc) {
      return {};
    }
    const range = this.locationToRange(loc);

    const attrs = this.getAttributes(elem, lineno, [
      "alt",
      "imagesdir",
      "target"
    ]);
    let children = [{ type: "Str", value: raw, loc, range, raw }];
    if (attrs.length > 0) {
      children = attrs.concat(children);
    }

    const title = this.getBlockTitle(elem, lineno);
    if ("type" in title) {
      children.unshift(title);
    }
    const obj = {
      type: "Image",
      children,
      loc,
      range,
      raw
    };
    return obj;
  }

  getAttributes(elem, lineno, keys) {
    if (typeof elem.getAttributes !== "function") {
      return [];
    }

    let children = [];
    for (const pos in keys) {
      const line = elem.getSourceLocation().lineno - 1;
      const raw = elem.getAttribute(keys[pos]);
      const loc = this.findLocation([raw], {
        ...lineno,
        type: "Attribute"
      });
      if (!loc || typeof raw === "undefined") {
        continue;
      }
      const range = this.locationToRange(loc);
      children.push({
        type: "Attribute",
        name: keys[pos],
        children: [{ type: "Str", value: raw, loc, range, raw }],
        loc,
        range,
        raw
      });
    }
    return children;
  }

  getBlockTitle(elem, lineno) {
    if (typeof elem.hasTitle !== "function" || elem.hasTitle() === false) {
      return [];
    }

    const line = elem.getSourceLocation().lineno - 1;
    const raw = "." + elem.getTitle();
    const loc = this.findLocationBackward(
      [raw],
      {
        ...lineno,
        type: "Attribute"
      },
      3 /* Look backward at most three lines. */
    );
    if (!loc || typeof raw === "undefined") {
      return [];
    }
    const range = this.locationToRange(loc);
    const obj = {
      type: "BlockTitle",
      children: [{ type: "Str", value: raw, loc, range, raw }],
      loc,
      range,
      raw
    };
    return obj;
  }

  // This is nearly identical to convertSection.
  convertSidebar(elem, lineno) {
    let children = this.convertElementList(elem.$blocks(), lineno);

    const title = this.getBlockTitle(elem, lineno);
    if ("type" in title) {
      children = [title, ...children];
    }

    const obj = {
      type: "Sidebar",
      children: children,
      raw: "",
      ...this.locAndRangeFrom(children)
    };
    return obj;
  }
}

export default function parse(text) {
  return new Converter().convert(text);
}
