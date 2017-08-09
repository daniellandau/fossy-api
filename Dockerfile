# FOSSology Dockerfile
# Copyright Siemens AG 2016, fabio.huser@siemens.com
#
# Copying and distribution of this file, with or without modification,
# are permitted in any medium without royalty provided the copyright
# notice and this notice are preserved.  This file is offered as-is,
# without any warranty.
#
# Description: Docker container image recipe

FROM debian:8.8

MAINTAINER Daniel Landau <daniel@landau.fi>

WORKDIR /fossy-api

RUN apt-get update && \
    apt-get install -y curl 

RUN curl -sL https://deb.nodesource.com/setup_8.x | bash -

COPY ./fossology/utils/fo-installdeps .

RUN apt-get update && \
    apt-get install -y lsb-release sudo postgresql php5-curl libpq-dev libdbd-sqlite3-perl libspreadsheet-writeexcel-perl && \
    apt-get install -y nodejs && \
    /fossy-api/fo-installdeps -e -y && \
    rm -rf /var/lib/apt/lists/*

RUN curl -sS https://getcomposer.org/installer | php && \
    mv composer.phar /usr/local/bin/composer

COPY ./fossology/install/scripts/install-spdx-tools.sh .
COPY ./fossology/install/scripts/install-ninka.sh .

RUN /fossy-api/install-spdx-tools.sh

RUN /fossy-api/install-ninka.sh

COPY ./fossology /fossology

RUN cd /fossology && make install

COPY . .

RUN cp /fossy-api/fossology/install/src-install-apache-example.conf /etc/apache2/conf-available/fossology.conf && \
    ln -s /etc/apache2/conf-available/fossology.conf /etc/apache2/conf-enabled/fossology.conf

RUN /fossy-api/fossology/install/scripts/php-conf-fix.sh --overwrite

EXPOSE 8081

RUN chmod +x /fossy-api/docker-entrypoint.sh
ENTRYPOINT ["/fossy-api/docker-entrypoint.sh"]
